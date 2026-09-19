'use server'

import 'server-only'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { getSession, isManager } from '@/lib/auth'
import { getAdminClient } from '@/lib/supabase/server'
import { getDemoSessionId } from '@/lib/demo-session'
import {
  addDemoBooking, addDemoTimeOff, demoBarbers, demoServices, removeDemoTimeOff,
  setDemoBookingStatus,
} from '@/lib/demo'
import { getBarbers, getServices } from '@/lib/shop'
import { resolveService } from '@/lib/types'
import { totalDuration } from '@/lib/availability'

export type ActionResult = { ok: true } | { ok: false; error: string }

const EXCLUSION_VIOLATION = '23P01'

const statusSchema = z.object({
  appointmentId: z.string().min(1),
  status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']),
})

/** Mark an appointment done, a no-show, or cancel it from the shop's side. */
export async function setAppointmentStatus(
  raw: z.input<typeof statusSchema>,
): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'That request was not valid.' }
  const { appointmentId, status } = parsed.data

  const session = await getSession()
  if (!session) return { ok: false, error: 'Please sign in again.' }

  if (session.isDemo) {
    const changed = setDemoBookingStatus(await getDemoSessionId(), appointmentId, status)
    if (!changed) return { ok: false, error: 'We could not find that appointment.' }
    revalidatePath('/admin')
    return { ok: true }
  }

  const admin = getAdminClient()
  const { error } = await admin
    .from('appointments')
    .update({
      status,
      ...(status === 'cancelled'
        ? { cancelled_at: new Date().toISOString(), cancelled_by: 'shop' }
        : { cancelled_at: null, cancelled_by: null }),
    })
    .eq('id', appointmentId)
    // Scoped to the signed-in member of staff's own shop, so an appointment id
    // from elsewhere cannot be touched.
    .eq('shop_id', session.shop.id)

  if (error) {
    return error.code === EXCLUSION_VIOLATION
      ? { ok: false, error: 'That time now clashes with another appointment.' }
      : { ok: false, error: 'We could not update that appointment.' }
  }

  revalidatePath('/admin')
  return { ok: true }
}

const walkInSchema = z.object({
  barberId: z.string().min(1),
  serviceIds: z.array(z.string().min(1)).min(1),
  startsAt: z.string().datetime({ offset: true }),
  name: z.string().trim().min(1, 'Give the customer a name').max(120),
  phone: z.string().trim().max(30).optional(),
  note: z.string().trim().max(500).optional(),
})

/**
 * Book someone in from behind the chair.
 *
 * Unlike a customer booking this ignores lead time, the booking horizon and
 * opening hours: if a barber says they will squeeze someone in at 17:50, that
 * is the shop's call. Overlap is still refused -- by the database's exclusion
 * constraint on real data, and by the same rule in demo mode.
 */
export async function createWalkIn(
  raw: z.input<typeof walkInSchema>,
): Promise<ActionResult> {
  const parsed = walkInSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }
  const input = parsed.data

  const session = await getSession()
  if (!session) return { ok: false, error: 'Please sign in again.' }

  const startsAt = new Date(input.startsAt)
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: 'That time is not valid.' }
  }

  const barbers = session.isDemo ? demoBarbers : await getBarbers(session.shop.id)
  const services = session.isDemo ? demoServices : await getServices(session.shop.id)

  const barber = barbers.find((b) => b.id === input.barberId)
  if (!barber) return { ok: false, error: 'We could not find that barber.' }

  const chosen = input.serviceIds
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((service) => resolveService(service, barber))

  if (chosen.length !== input.serviceIds.length) {
    return { ok: false, error: 'One of those services no longer exists.' }
  }

  const duration = totalDuration(
    chosen.map((s) => ({
      durationMinutes: s.durationMinutes,
      bufferAfterMinutes: s.bufferAfterMinutes,
    })),
  )
  const endsAt = new Date(startsAt.getTime() + duration * 60_000)

  if (session.isDemo) {
    const stored = addDemoBooking(await getDemoSessionId(), {
      token: randomUUID(),
      barberId: barber.id,
      startsAt,
      endsAt,
      name: input.name,
      phone: input.phone || null,
      note: input.note || null,
      services: chosen.map((s) => ({
        name: s.name, pricePence: s.pricePence, durationMinutes: s.durationMinutes,
      })),
    })
    if (!stored) return { ok: false, error: `${barber.name} is already booked then.` }
    revalidatePath('/admin')
    return { ok: true }
  }

  const admin = getAdminClient()
  const customer = await admin
    .from('customers')
    .insert({
      shop_id: session.shop.id,
      name: input.name,
      phone: input.phone || null,
      // Walk-ins often leave nothing; the table requires one of the two.
      email: input.phone ? null : `walkin+${randomUUID()}@invalid.local`,
    })
    .select('id')
    .single()

  if (customer.error || !customer.data) {
    return { ok: false, error: 'We could not save that customer.' }
  }

  const appointment = await admin
    .from('appointments')
    .insert({
      shop_id: session.shop.id,
      staff_id: barber.id,
      customer_id: customer.data.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      customer_note: input.note || null,
    })
    .select('id')
    .single()

  if (appointment.error) {
    await admin.from('customers').delete().eq('id', customer.data.id)
    return appointment.error.code === EXCLUSION_VIOLATION
      ? { ok: false, error: `${barber.name} is already booked then.` }
      : { ok: false, error: 'We could not save that appointment.' }
  }

  const lines = await admin.from('appointment_services').insert(
    chosen.map((service, position) => ({
      appointment_id: appointment.data.id,
      service_id: service.id,
      name: service.name,
      duration_minutes: service.durationMinutes,
      price_pence: service.pricePence,
      position,
    })),
  )
  if (lines.error) {
    await admin.from('appointments').delete().eq('id', appointment.data.id)
    return { ok: false, error: 'We could not save that appointment.' }
  }

  revalidatePath('/admin')
  return { ok: true }
}

const timeOffSchema = z.object({
  barberId: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(200).optional(),
})

/** Block out a barber's time: holiday, dentist, an early finish. */
export async function addTimeOff(
  raw: z.input<typeof timeOffSchema>,
): Promise<ActionResult> {
  const parsed = timeOffSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'That request was not valid.' }
  const input = parsed.data

  const session = await getSession()
  if (!session) return { ok: false, error: 'Please sign in again.' }

  const start = new Date(input.startsAt)
  const end = new Date(input.endsAt)
  if (end <= start) return { ok: false, error: 'The end must be after the start.' }

  // A barber may block their own time; changing someone else's needs a manager.
  if (input.barberId !== session.staffId && !isManager(session)) {
    return { ok: false, error: 'Only an owner or manager can block someone else’s time.' }
  }

  if (session.isDemo) {
    addDemoTimeOff(await getDemoSessionId(), {
      barberId: input.barberId, start, end, reason: input.reason || null,
    })
    revalidatePath('/admin')
    return { ok: true }
  }

  const admin = getAdminClient()
  const { error } = await admin.from('time_off').insert({
    shop_id: session.shop.id,
    staff_id: input.barberId,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    reason: input.reason || null,
  })
  if (error) return { ok: false, error: 'We could not save that.' }

  revalidatePath('/admin')
  return { ok: true }
}

export async function removeTimeOff(id: string): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Please sign in again.' }

  if (session.isDemo) {
    removeDemoTimeOff(await getDemoSessionId(), id)
    revalidatePath('/admin')
    return { ok: true }
  }

  const admin = getAdminClient()
  const { error } = await admin
    .from('time_off').delete().eq('id', id).eq('shop_id', session.shop.id)
  if (error) return { ok: false, error: 'We could not remove that.' }

  revalidatePath('/admin')
  return { ok: true }
}
