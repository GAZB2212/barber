import 'server-only'
import { cache } from 'react'
import { getServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import {
  DEMO_SLUG, demoBarbers, demoBusyFor, demoOpeningHours, demoServices, demoShop,
} from '@/lib/demo'
import { getDemoSessionId } from '@/lib/demo-session'
import type { Barber, Service, Shop } from '@/lib/types'
import {
  localDateOf,
  mergeIntervals,
  resolveOpeningWindows,
  slotsForDay,
  type Interval,
  type OpeningWindow,
} from '@/lib/availability'

/** Slugs that must never resolve to a tenant. */
export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'auth', 'book', 'dashboard', 'login', 'logout',
  'signup', 'settings', 'support', 'help', 'about', 'pricing', 'terms',
  'privacy', 'static', '_next', 'favicon.ico', 'robots.txt', 'sitemap.xml',
])

type ShopRow = {
  id: string; slug: string; name: string; tagline: string | null
  about: string | null; phone: string | null; email: string | null
  address_line1: string | null; address_line2: string | null
  city: string | null; postcode: string | null; timezone: string
  slot_interval_minutes: number; lead_time_minutes: number
  horizon_days: number; cancellation_hours: number
  max_services_per_booking: number; logo_url: string | null; theme: unknown
}

function toShop(row: ShopRow): Shop {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    about: row.about,
    phone: row.phone,
    email: row.email,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    postcode: row.postcode,
    timezone: row.timezone,
    slotIntervalMinutes: row.slot_interval_minutes,
    leadTimeMinutes: row.lead_time_minutes,
    horizonDays: row.horizon_days,
    cancellationHours: row.cancellation_hours,
    maxServicesPerBooking: row.max_services_per_booking,
    logoUrl: row.logo_url,
    theme: row.theme,
  }
}

/**
 * `cache` dedupes this across a single render pass, so the layout and the page
 * can each ask for the shop without a second round trip.
 */
export const getShopBySlug = cache(async (slug: string): Promise<Shop | null> => {
  if (RESERVED_SLUGS.has(slug)) return null
  if (!isSupabaseConfigured()) return slug === DEMO_SLUG ? demoShop : null
  const supabase = await getServerClient()
  const { data, error } = await supabase
    .from('shops')
    .select(
      `id, slug, name, tagline, about, phone, email, address_line1, address_line2, city, postcode, timezone, slot_interval_minutes, lead_time_minutes, horizon_days, cancellation_hours, max_services_per_booking, logo_url, theme`,
    )
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(`Could not load shop "${slug}": ${error.message}`)
  return data ? toShop(data as ShopRow) : null
})

export const getServices = cache(async (shopId: string): Promise<Service[]> => {
  if (!isSupabaseConfigured()) return demoServices
  const supabase = await getServerClient()
  const { data, error } = await supabase
    .from('services')
    .select('id, name, description, category, duration_minutes, price_pence, buffer_after_minutes')
    .eq('shop_id', shopId)
    .order('display_order')
    .order('name')

  if (error) throw new Error(`Could not load services: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    durationMinutes: row.duration_minutes,
    pricePence: row.price_pence,
    bufferAfterMinutes: row.buffer_after_minutes,
  }))
})

export const getBarbers = cache(async (shopId: string): Promise<Barber[]> => {
  if (!isSupabaseConfigured()) return demoBarbers
  const supabase = await getServerClient()
  const { data, error } = await supabase
    .from('staff')
    .select(
      `id, name, bio, avatar_url, accepts_bookings, staff_services (service_id, duration_override_minutes, price_override_pence)`,
    )
    .eq('shop_id', shopId)
    .order('display_order')
    .order('name')

  if (error) throw new Error(`Could not load barbers: ${error.message}`)

  type LinkRow = {
    service_id: string
    duration_override_minutes: number | null
    price_override_pence: number | null
  }

  return (data ?? []).map((row) => {
    const links = (row.staff_services ?? []) as LinkRow[]
    const overrides: Barber['overrides'] = {}
    for (const link of links) {
      const entry: { durationMinutes?: number; pricePence?: number } = {}
      if (link.duration_override_minutes !== null) {
        entry.durationMinutes = link.duration_override_minutes
      }
      if (link.price_override_pence !== null) {
        entry.pricePence = link.price_override_pence
      }
      if (Object.keys(entry).length > 0) overrides[link.service_id] = entry
    }
    return {
      id: row.id,
      name: row.name,
      bio: row.bio,
      avatarUrl: row.avatar_url,
      acceptsBookings: row.accepts_bookings,
      serviceIds: links.map((link) => link.service_id),
      overrides,
    }
  })
})

type HoursRow = { staff_id: string | null; weekday: number; opens_at: string; closes_at: string }

/**
 * Everything the slot engine needs for one barber over one day, in one place
 * so that offering slots and re-validating a booking cannot drift apart.
 */
export async function loadAvailabilityContext(
  shop: Shop,
  barberId: string,
  fromDate: string,
  toDate: string = fromDate,
) {
  if (!isSupabaseConfigured()) {
    return {
      openingWindows: resolveOpeningWindows(
        demoOpeningHours.shop,
        demoOpeningHours[barberId] ?? [],
      ),
      closedDates: [] as string[],
      busy: mergeIntervals(demoBusyFor(await getDemoSessionId(), barberId)),
    }
  }
  const supabase = await getServerClient()

  // Widen the free/busy window by a day either side: an appointment starting
  // late the previous evening can still overlap the first morning.
  const windowStart = new Date(`${fromDate}T00:00:00Z`)
  windowStart.setUTCDate(windowStart.getUTCDate() - 1)
  const windowEnd = new Date(`${toDate}T00:00:00Z`)
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 2)

  const [hours, closures, timeOff, busy] = await Promise.all([
    supabase.from('opening_hours')
      .select('staff_id, weekday, opens_at, closes_at')
      .eq('shop_id', shop.id),
    supabase.from('closures').select('on_date').eq('shop_id', shop.id),
    supabase.from('time_off')
      .select('starts_at, ends_at')
      .eq('staff_id', barberId)
      .lt('starts_at', windowEnd.toISOString())
      .gt('ends_at', windowStart.toISOString()),
    supabase.rpc('public_busy_windows', {
      target_shop: shop.id,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
    }),
  ])

  for (const result of [hours, closures, timeOff, busy]) {
    if (result.error) {
      throw new Error(`Could not load availability: ${result.error.message}`)
    }
  }

  const rows = (hours.data ?? []) as HoursRow[]
  const toWindow = (row: HoursRow): OpeningWindow => ({
    weekday: row.weekday,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
  })

  const openingWindows = resolveOpeningWindows(
    rows.filter((r) => r.staff_id === null).map(toWindow),
    rows.filter((r) => r.staff_id === barberId).map(toWindow),
  )

  const busyRows = (busy.data ?? []) as
    { staff_id: string; starts_at: string; ends_at: string }[]

  const intervals: Interval[] = [
    ...busyRows
      .filter((row) => row.staff_id === barberId)
      .map((row) => ({ start: new Date(row.starts_at), end: new Date(row.ends_at) })),
    ...((timeOff.data ?? []) as { starts_at: string; ends_at: string }[])
      .map((row) => ({ start: new Date(row.starts_at), end: new Date(row.ends_at) })),
  ]

  return {
    openingWindows,
    closedDates: ((closures.data ?? []) as { on_date: string }[]).map((r) => r.on_date),
    busy: mergeIntervals(intervals),
  }
}

/** Bookable start instants for one barber, one day, one set of services. */
export async function getDaySlots(
  shop: Shop,
  barberId: string,
  date: string,
  durationMinutes: number,
  now = new Date(),
): Promise<Date[]> {
  const context = await loadAvailabilityContext(shop, barberId, date)
  return slotsForDay({
    date,
    timezone: shop.timezone,
    durationMinutes,
    slotIntervalMinutes: shop.slotIntervalMinutes,
    leadTimeMinutes: shop.leadTimeMinutes,
    horizonDays: shop.horizonDays,
    now,
    ...context,
  })
}

export const todayInShop = (shop: Shop) => localDateOf(new Date(), shop.timezone)

/** Consecutive local dates from `start`, inclusive. */
export function dateRange(start: string, days: number): string[] {
  const [year, month, day] = start.split('-').map(Number)
  return Array.from({ length: days }, (_, offset) => {
    const d = new Date(Date.UTC(year, month - 1, day + offset))
    return d.toISOString().slice(0, 10)
  })
}

/**
 * Slots for a run of days in one pass.
 *
 * The date strip needs to know which days are full before the customer taps
 * them, so availability is loaded once for the whole range rather than once
 * per day.
 */
export async function getSlotsForRange(
  shop: Shop,
  barberId: string,
  dates: string[],
  durationMinutes: number,
  now = new Date(),
): Promise<Record<string, Date[]>> {
  if (dates.length === 0) return {}
  const context = await loadAvailabilityContext(
    shop, barberId, dates[0], dates[dates.length - 1],
  )

  const result: Record<string, Date[]> = {}
  for (const date of dates) {
    result[date] = slotsForDay({
      date,
      timezone: shop.timezone,
      durationMinutes,
      slotIntervalMinutes: shop.slotIntervalMinutes,
      leadTimeMinutes: shop.leadTimeMinutes,
      horizonDays: shop.horizonDays,
      now,
      ...context,
    })
  }
  return result
}
