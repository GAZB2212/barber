'use server'

import 'server-only'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireManagerSession } from '@/lib/auth'
import { getAdminClient } from '@/lib/supabase/server'
import { themeSchema } from '@/lib/theme'

export type ActionResult = { ok: true } | { ok: false; error: string }

const DEMO_MESSAGE =
  'Demo mode cannot save configuration. Connect a Supabase project to make changes stick.'

/** Shared guard: manager role, and a real database behind it. */
async function guard() {
  const result = await requireManagerSession()
  if (!result.ok) return result
  if (result.session.isDemo) return { ok: false as const, error: DEMO_MESSAGE }
  return result
}

const serviceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Give the service a name').max(120),
  description: z.string().trim().max(300).optional(),
  category: z.string().trim().max(60).optional(),
  durationMinutes: z.coerce.number().int().min(5).max(480),
  pricePence: z.coerce.number().int().min(0),
  bufferAfterMinutes: z.coerce.number().int().min(0).max(120).default(0),
  isActive: z.coerce.boolean().default(true),
})

export async function saveService(raw: z.input<typeof serviceSchema>): Promise<ActionResult> {
  const session = await guard()
  if (!session.ok) return session

  const parsed = serviceSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const input = parsed.data

  const admin = getAdminClient()
  const row = {
    shop_id: session.session.shop.id,
    name: input.name,
    description: input.description || null,
    category: input.category || null,
    duration_minutes: input.durationMinutes,
    price_pence: input.pricePence,
    buffer_after_minutes: input.bufferAfterMinutes,
    is_active: input.isActive,
  }

  const { error } = input.id
    ? await admin.from('services').update(row).eq('id', input.id)
        .eq('shop_id', session.session.shop.id)
    : await admin.from('services').insert(row)

  if (error) return { ok: false, error: 'We could not save that service.' }
  revalidatePath('/admin/services')
  return { ok: true }
}

/**
 * Services are retired rather than deleted: past appointments reference them,
 * and a shop that removes "Skin fade" should not lose its own history.
 */
export async function retireService(id: string): Promise<ActionResult> {
  const session = await guard()
  if (!session.ok) return session

  const admin = getAdminClient()
  const { error } = await admin.from('services')
    .update({ is_active: false })
    .eq('id', id)
    .eq('shop_id', session.session.shop.id)

  if (error) return { ok: false, error: 'We could not retire that service.' }
  revalidatePath('/admin/services')
  return { ok: true }
}

const staffSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Give them a name').max(120),
  role: z.enum(['owner', 'manager', 'barber']),
  bio: z.string().trim().max(300).optional(),
  acceptsBookings: z.coerce.boolean().default(true),
  isActive: z.coerce.boolean().default(true),
  serviceIds: z.array(z.string().uuid()).default([]),
})

export async function saveStaff(raw: z.input<typeof staffSchema>): Promise<ActionResult> {
  const session = await guard()
  if (!session.ok) return session

  const parsed = staffSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const input = parsed.data

  const admin = getAdminClient()
  const row = {
    shop_id: session.session.shop.id,
    name: input.name,
    role: input.role,
    bio: input.bio || null,
    accepts_bookings: input.acceptsBookings,
    is_active: input.isActive,
  }

  const saved = input.id
    ? await admin.from('staff').update(row).eq('id', input.id)
        .eq('shop_id', session.session.shop.id).select('id').single()
    : await admin.from('staff').insert(row).select('id').single()

  if (saved.error || !saved.data) {
    return { ok: false, error: 'We could not save that team member.' }
  }

  // Replace the service assignments wholesale: simpler than diffing, and the
  // set is small.
  await admin.from('staff_services').delete().eq('staff_id', saved.data.id)
  if (input.serviceIds.length > 0) {
    const links = await admin.from('staff_services').insert(
      input.serviceIds.map((serviceId) => ({
        staff_id: saved.data.id, service_id: serviceId,
      })),
    )
    if (links.error) {
      return { ok: false, error: 'Saved, but their services could not be updated.' }
    }
  }

  revalidatePath('/admin/staff')
  return { ok: true }
}

const hoursSchema = z.object({
  staffId: z.string().uuid().nullable(),
  windows: z.array(z.object({
    weekday: z.coerce.number().int().min(0).max(6),
    opensAt: z.string().regex(/^\d{2}:\d{2}$/),
    closesAt: z.string().regex(/^\d{2}:\d{2}$/),
  })),
})

/** Replaces the whole week for one barber, or for the shop when staffId is null. */
export async function saveOpeningHours(
  raw: z.input<typeof hoursSchema>,
): Promise<ActionResult> {
  const session = await guard()
  if (!session.ok) return session

  const parsed = hoursSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Those hours are not valid.' }
  const input = parsed.data

  for (const window of input.windows) {
    if (window.closesAt <= window.opensAt) {
      return { ok: false, error: 'Closing time must be after opening time.' }
    }
  }

  const admin = getAdminClient()
  const shopId = session.session.shop.id

  const existing = admin.from('opening_hours').delete().eq('shop_id', shopId)
  const { error: clearError } = input.staffId
    ? await existing.eq('staff_id', input.staffId)
    : await existing.is('staff_id', null)
  if (clearError) return { ok: false, error: 'We could not update those hours.' }

  if (input.windows.length > 0) {
    const { error } = await admin.from('opening_hours').insert(
      input.windows.map((window) => ({
        shop_id: shopId,
        staff_id: input.staffId,
        weekday: window.weekday,
        opens_at: window.opensAt,
        closes_at: window.closesAt,
      })),
    )
    if (error) return { ok: false, error: 'We could not save those hours.' }
  }

  revalidatePath('/admin/hours')
  return { ok: true }
}

const settingsSchema = z.object({
  name: z.string().trim().min(1, 'The shop needs a name').max(120),
  tagline: z.string().trim().max(160).optional(),
  about: z.string().trim().max(1000).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(160).optional(),
  addressLine1: z.string().trim().max(160).optional(),
  city: z.string().trim().max(80).optional(),
  postcode: z.string().trim().max(16).optional(),
  slotIntervalMinutes: z.coerce.number().int().min(5).max(60),
  leadTimeMinutes: z.coerce.number().int().min(0).max(10_080),
  horizonDays: z.coerce.number().int().min(1).max(365),
  cancellationHours: z.coerce.number().int().min(0).max(336),
  maxServicesPerBooking: z.coerce.number().int().min(1).max(10),
  isPublished: z.coerce.boolean().default(false),
  theme: themeSchema.partial().optional(),
})

export async function saveSettings(
  raw: z.input<typeof settingsSchema>,
): Promise<ActionResult> {
  const session = await guard()
  if (!session.ok) return session

  const parsed = settingsSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const input = parsed.data

  const admin = getAdminClient()
  const { error } = await admin.from('shops').update({
    name: input.name,
    tagline: input.tagline || null,
    about: input.about || null,
    phone: input.phone || null,
    email: input.email || null,
    address_line1: input.addressLine1 || null,
    city: input.city || null,
    postcode: input.postcode || null,
    slot_interval_minutes: input.slotIntervalMinutes,
    lead_time_minutes: input.leadTimeMinutes,
    horizon_days: input.horizonDays,
    cancellation_hours: input.cancellationHours,
    max_services_per_booking: input.maxServicesPerBooking,
    is_published: input.isPublished,
    ...(input.theme ? { theme: input.theme } : {}),
  }).eq('id', session.session.shop.id)

  if (error) return { ok: false, error: 'We could not save those settings.' }

  revalidatePath('/admin/settings')
  revalidatePath(`/${session.session.shop.slug}`)
  return { ok: true }
}
