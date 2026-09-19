import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { demoShop } from '@/lib/demo'
import type { Shop } from '@/lib/types'

export type StaffRole = 'owner' | 'manager' | 'barber'

export type Session = {
  staffId: string
  name: string
  role: StaffRole
  email: string | null
  shop: Shop
  /**
   * True when running against the in-memory demo. Screens use it to explain
   * why configuration cannot be saved, rather than failing silently.
   */
  isDemo: boolean
}

export const MANAGER_ROLES: StaffRole[] = ['owner', 'manager']

/**
 * The signed-in member of staff, or null.
 *
 * With Supabase unconfigured this returns a demo owner, so the dashboard can
 * be explored with no database and no account -- matching the public site.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  if (!isSupabaseConfigured()) {
    return {
      staffId: '00000000-0000-4000-8000-000000001001',
      name: 'Marcus',
      role: 'owner',
      email: 'marcus@example.com',
      shop: demoShop,
      isDemo: true,
    }
  }

  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // A member of staff belongs to exactly one shop in this version.
  const { data } = await supabase
    .from('staff')
    .select(
      `id, name, role, shops (id, slug, name, tagline, about, phone, email, address_line1, address_line2, city, postcode, timezone, slot_interval_minutes, lead_time_minutes, horizon_days, cancellation_hours, max_services_per_booking, logo_url, theme)`,
    )
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!data) return null
  const row = data.shops as unknown as Record<string, unknown> | null
  if (!row) return null

  return {
    staffId: data.id as string,
    name: data.name as string,
    role: data.role as StaffRole,
    email: user.email ?? null,
    isDemo: false,
    shop: {
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string,
      tagline: row.tagline as string | null,
      about: row.about as string | null,
      phone: row.phone as string | null,
      email: row.email as string | null,
      addressLine1: row.address_line1 as string | null,
      addressLine2: row.address_line2 as string | null,
      city: row.city as string | null,
      postcode: row.postcode as string | null,
      timezone: row.timezone as string,
      slotIntervalMinutes: row.slot_interval_minutes as number,
      leadTimeMinutes: row.lead_time_minutes as number,
      horizonDays: row.horizon_days as number,
      cancellationHours: row.cancellation_hours as number,
      maxServicesPerBooking: row.max_services_per_booking as number,
      logoUrl: row.logo_url as string | null,
      theme: row.theme,
    },
  }
})

/** For pages: redirects to the login screen when signed out. */
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/admin/login')
  return session
}

/** For actions: returns a result rather than redirecting mid-mutation. */
export async function requireManagerSession(): Promise<
  { ok: true; session: Session } | { ok: false; error: string }
> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Please sign in again.' }
  if (!MANAGER_ROLES.includes(session.role)) {
    return { ok: false, error: 'Only an owner or manager can change that.' }
  }
  return { ok: true, session }
}

export const isManager = (session: Session) => MANAGER_ROLES.includes(session.role)
