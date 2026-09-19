'use server'

import 'server-only'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/server'
import { getBarbers, getServices, getShopBySlug, loadAvailabilityContext } from '@/lib/shop'
import { resolveService } from '@/lib/types'
import { isSlotBookable, totalDuration } from '@/lib/availability'
import { isSupabaseConfigured } from '@/lib/env'
import { addDemoBooking, cancelDemoBooking } from '@/lib/demo'
import { getDemoSessionId } from '@/lib/demo-session'
import { randomUUID } from 'node:crypto'

const bookingSchema = z.object({
  shopSlug: z.string().min(1),
  barberId: z.string().uuid(),
  serviceIds: z.array(z.string().uuid()).min(1),
  /** Shop-local calendar date, 'YYYY-MM-DD'. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Chosen start instant, ISO 8601. */
  startsAt: z.string().datetime({ offset: true }),
  name: z.string().trim().min(1, 'Please tell us your name').max(120),
  email: z.string().trim().email('That email address looks wrong').or(z.literal('')),
  phone: z.string().trim().min(7, 'That phone number looks too short').max(30).or(z.literal('')),
  note: z.string().trim().max(500).optional(),
}).refine((value) => value.email !== '' || value.phone !== '', {
  message: 'Leave an email or a phone number so we can reach you',
  path: ['email'],
})

export type BookingInput = z.input<typeof bookingSchema>

export type BookingResult =
  | { ok: true; manageToken: string; startsAt: string }
  | { ok: false; error: string; field?: string; slotTaken?: boolean }

/** Postgres exclusion-constraint violation: the barber is already booked. */
const EXCLUSION_VIOLATION = '23P01'

/**
 * Create a booking.
 *
 * Availability is recomputed here rather than trusted from the client, because
 * the slot list the customer saw may be minutes stale. Even so, two people can
 * submit the same slot at once -- so the database's exclusion constraint is the
 * real arbiter, and losing that race is reported as a normal, recoverable
 * outcome rather than an error.
 */
export async function createBooking(raw: BookingInput): Promise<BookingResult> {
  const parsed = bookingSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? '') }
  }
  const input = parsed.data

  const shop = await getShopBySlug(input.shopSlug)
  if (!shop) return { ok: false, error: 'We could not find that shop.' }

  const [barbers, services] = await Promise.all([
    getBarbers(shop.id),
    getServices(shop.id),
  ])

  const barber = barbers.find((b) => b.id === input.barberId)
  if (!barber || !barber.acceptsBookings) {
    return { ok: false, error: 'That barber is not taking bookings.' }
  }

  if (input.serviceIds.length > shop.maxServicesPerBooking) {
    return {
      ok: false,
      error: `You can book up to ${shop.maxServicesPerBooking} services at once.`,
    }
  }

  // Preserve the customer's chosen order, and reject anything this barber
  // does not actually offer.
  const chosen = input.serviceIds.map((id) => {
    const service = services.find((s) => s.id === id)
    if (!service || !barber.serviceIds.includes(id)) return null
    return resolveService(service, barber)
  })
  if (chosen.some((s) => s === null)) {
    return { ok: false, error: `${barber.name} does not offer one of those services.` }
  }
  const resolved = chosen as NonNullable<(typeof chosen)[number]>[]

  const duration = totalDuration(
    resolved.map((s) => ({
      durationMinutes: s.durationMinutes,
      bufferAfterMinutes: s.bufferAfterMinutes,
    })),
  )

  const startsAt = new Date(input.startsAt)
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: 'That appointment time is not valid.' }
  }

  const context = await loadAvailabilityContext(shop, barber.id, input.date)
  const bookable = isSlotBookable(startsAt, {
    date: input.date,
    timezone: shop.timezone,
    durationMinutes: duration,
    slotIntervalMinutes: shop.slotIntervalMinutes,
    leadTimeMinutes: shop.leadTimeMinutes,
    horizonDays: shop.horizonDays,
    now: new Date(),
    ...context,
  })
  if (!bookable) {
    return {
      ok: false,
      slotTaken: true,
      error: 'Sorry, that time has just gone. Please pick another.',
    }
  }

  const endsAt = new Date(startsAt.getTime() + duration * 60_000)

  if (!isSupabaseConfigured()) {
    const token = randomUUID()
    const stored = addDemoBooking(await getDemoSessionId(), {
      token,
      barberId: barber.id,
      startsAt,
      endsAt,
      name: input.name,
      services: resolved.map((s) => ({
        name: s.name, pricePence: s.pricePence, durationMinutes: s.durationMinutes,
      })),
    })
    if (!stored) {
      return {
        ok: false,
        slotTaken: true,
        error: 'Someone just took that time. Please pick another.',
      }
    }
    return { ok: true, manageToken: token, startsAt: startsAt.toISOString() }
  }

  const admin = getAdminClient()

  const email = input.email === '' ? null : input.email.toLowerCase()
  const phone = input.phone === '' ? null : input.phone

  // Match a returning customer on email, else phone, so their history builds up
  // without ever asking them to create an account.
  let customerId: string | null = null
  const existing = email
    ? await admin.from('customers').select('id').eq('shop_id', shop.id).eq('email', email).maybeSingle()
    : await admin.from('customers').select('id').eq('shop_id', shop.id).eq('phone', phone!).maybeSingle()

  if (existing.error) {
    return { ok: false, error: 'Something went wrong saving your details.' }
  }

  if (existing.data) {
    customerId = existing.data.id
    await admin.from('customers')
      .update({ name: input.name, ...(email ? { email } : {}), ...(phone ? { phone } : {}) })
      .eq('id', customerId)
  } else {
    const created = await admin.from('customers')
      .insert({ shop_id: shop.id, name: input.name, email, phone })
      .select('id')
      .single()
    if (created.error || !created.data) {
      return { ok: false, error: 'Something went wrong saving your details.' }
    }
    customerId = created.data.id
  }

  const appointment = await admin.from('appointments')
    .insert({
      shop_id: shop.id,
      staff_id: barber.id,
      customer_id: customerId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      customer_note: input.note || null,
    })
    .select('id, manage_token, starts_at')
    .single()

  if (appointment.error) {
    if (appointment.error.code === EXCLUSION_VIOLATION) {
      return {
        ok: false,
        slotTaken: true,
        error: 'Someone just took that time. Please pick another.',
      }
    }
    return { ok: false, error: 'Something went wrong confirming your booking.' }
  }

  const lines = resolved.map((service, position) => ({
    appointment_id: appointment.data.id,
    service_id: service.id,
    name: service.name,
    duration_minutes: service.durationMinutes,
    price_pence: service.pricePence,
    position,
  }))

  const linesResult = await admin.from('appointment_services').insert(lines)
  if (linesResult.error) {
    // Without its services the appointment is meaningless; roll it back so the
    // slot is not silently held by a half-written booking.
    await admin.from('appointments').delete().eq('id', appointment.data.id)
    return { ok: false, error: 'Something went wrong confirming your booking.' }
  }

  return {
    ok: true,
    manageToken: appointment.data.manage_token,
    startsAt: appointment.data.starts_at,
  }
}

/** Cancel from an emailed link: the token is the only credential needed. */
export async function cancelBooking(
  manageToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(manageToken).success) {
    return { ok: false, error: 'That cancellation link is not valid.' }
  }

  if (!isSupabaseConfigured()) {
    return cancelDemoBooking(await getDemoSessionId(), manageToken)
      ? { ok: true }
      : { ok: false, error: 'We could not find that booking.' }
  }

  const admin = getAdminClient()
  const found = await admin.from('appointments')
    .select('id, starts_at, status, shops (cancellation_hours)')
    .eq('manage_token', manageToken)
    .maybeSingle()

  if (found.error || !found.data) {
    return { ok: false, error: 'We could not find that booking.' }
  }
  if (found.data.status === 'cancelled') return { ok: true }
  if (found.data.status !== 'confirmed') {
    return { ok: false, error: 'That booking can no longer be cancelled.' }
  }

  const shop = found.data.shops as unknown as { cancellation_hours: number } | null
  const cutoffHours = shop?.cancellation_hours ?? 0
  const startsAt = new Date(found.data.starts_at).getTime()
  if (startsAt - Date.now() < cutoffHours * 3_600_000) {
    return {
      ok: false,
      error: `Bookings can only be cancelled online more than ${cutoffHours} hours ahead. Please call the shop.`,
    }
  }

  const updated = await admin.from('appointments')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: 'customer' })
    .eq('id', found.data.id)

  if (updated.error) return { ok: false, error: 'We could not cancel that booking.' }
  return { ok: true }
}
