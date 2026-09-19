import 'server-only'
import { getServerClient } from '@/lib/supabase/server'
import { getDemoSessionId } from '@/lib/demo-session'
import { demoBarbers, demoOpeningHours, demoTimeOff } from '@/lib/demo'
import type { Session } from '@/lib/auth'
import type { OpeningWindow } from '@/lib/availability'

export type TimeOffEntry = {
  id: string
  barberId: string
  barberName: string
  startsAt: string
  endsAt: string
  reason: string | null
}

/** Upcoming absences only; past ones are noise on this screen. */
export async function getTimeOff(session: Session): Promise<TimeOffEntry[]> {
  const from = new Date()
  from.setHours(0, 0, 0, 0)

  if (session.isDemo) {
    return demoTimeOff(await getDemoSessionId())
      .filter((entry) => entry.end >= from)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((entry) => ({
        id: entry.id,
        barberId: entry.barberId,
        barberName: demoBarbers.find((b) => b.id === entry.barberId)?.name ?? '',
        startsAt: entry.start.toISOString(),
        endsAt: entry.end.toISOString(),
        reason: entry.reason,
      }))
  }

  const supabase = await getServerClient()
  const { data, error } = await supabase
    .from('time_off')
    .select('id, staff_id, starts_at, ends_at, reason, staff (name)')
    .eq('shop_id', session.shop.id)
    .gte('ends_at', from.toISOString())
    .order('starts_at')

  if (error) throw new Error(`Could not load time off: ${error.message}`)

  type Row = {
    id: string; staff_id: string; starts_at: string; ends_at: string
    reason: string | null; staff: { name: string } | null
  }

  return (data as unknown as Row[]).map((row) => ({
    id: row.id,
    barberId: row.staff_id,
    barberName: row.staff?.name ?? '',
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reason: row.reason,
  }))
}

export type HoursByOwner = {
  /** Keyed by staff id, plus 'shop' for the shop-wide default week. */
  [key: string]: OpeningWindow[]
}

export async function getOpeningHours(session: Session): Promise<HoursByOwner> {
  if (session.isDemo) return demoOpeningHours

  const supabase = await getServerClient()
  const { data, error } = await supabase
    .from('opening_hours')
    .select('staff_id, weekday, opens_at, closes_at')
    .eq('shop_id', session.shop.id)
    .order('weekday')

  if (error) throw new Error(`Could not load hours: ${error.message}`)

  type Row = { staff_id: string | null; weekday: number; opens_at: string; closes_at: string }
  const byOwner: HoursByOwner = {}
  for (const row of (data ?? []) as Row[]) {
    const key = row.staff_id ?? 'shop'
    // Trim seconds: the form works in HH:MM.
    ;(byOwner[key] ??= []).push({
      weekday: row.weekday,
      opensAt: row.opens_at.slice(0, 5),
      closesAt: row.closes_at.slice(0, 5),
    })
  }
  return byOwner
}
