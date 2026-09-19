import 'server-only'
import { getServerClient } from '@/lib/supabase/server'
import { getDemoSessionId } from '@/lib/demo-session'
import { demoAppointments, demoBarbers } from '@/lib/demo'
import { localDateOf } from '@/lib/availability'
import type { Session } from '@/lib/auth'

export type DiaryStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show'

export type DiaryEntry = {
  id: string
  barberId: string
  barberName: string
  customerName: string
  customerPhone: string | null
  startsAt: string
  endsAt: string
  status: DiaryStatus
  note: string | null
  services: { name: string; pricePence: number }[]
}

/** The instants bounding one shop-local calendar date. */
function dayBounds(date: string, timezone: string) {
  // Bound generously in UTC and filter precisely by local date afterwards, so
  // no appointment is missed whatever the offset.
  const start = new Date(`${date}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - 1)
  const end = new Date(`${date}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 2)
  return { start, end, timezone }
}

export async function getDiary(session: Session, date: string): Promise<DiaryEntry[]> {
  const { start, end, timezone } = dayBounds(date, session.shop.timezone)

  if (session.isDemo) {
    const sessionId = await getDemoSessionId()
    return demoAppointments(sessionId)
      .filter((booking) => localDateOf(booking.startsAt, timezone) === date)
      .map((booking) => ({
        id: booking.token,
        barberId: booking.barberId,
        barberName: demoBarbers.find((b) => b.id === booking.barberId)?.name ?? '',
        customerName: booking.name,
        customerPhone: booking.phone,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
        status: booking.status,
        note: booking.note,
        services: booking.services.map((s) => ({ name: s.name, pricePence: s.pricePence })),
      }))
  }

  const supabase = await getServerClient()
  const { data, error } = await supabase
    .from('appointments')
    .select(
      `id, staff_id, starts_at, ends_at, status, customer_note, staff (name), customers (name, phone), appointment_services (name, price_pence, position)`,
    )
    .eq('shop_id', session.shop.id)
    .gte('starts_at', start.toISOString())
    .lt('starts_at', end.toISOString())
    .order('starts_at')

  if (error) throw new Error(`Could not load the diary: ${error.message}`)

  type Row = {
    id: string; staff_id: string; starts_at: string; ends_at: string
    status: DiaryStatus; customer_note: string | null
    staff: { name: string } | null
    customers: { name: string; phone: string | null } | null
    appointment_services: { name: string; price_pence: number; position: number }[] | null
  }

  return (data as unknown as Row[])
    .filter((row) => localDateOf(new Date(row.starts_at), timezone) === date)
    .map((row) => ({
      id: row.id,
      barberId: row.staff_id,
      barberName: row.staff?.name ?? '',
      customerName: row.customers?.name ?? 'Walk-in',
      customerPhone: row.customers?.phone ?? null,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      note: row.customer_note,
      services: [...(row.appointment_services ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ name: s.name, pricePence: s.price_pence })),
    }))
}

/** Headline numbers for the day, cancellations excluded from takings. */
export function diaryTotals(entries: DiaryEntry[]) {
  const live = entries.filter((entry) => entry.status !== 'cancelled')
  return {
    booked: live.length,
    cancelled: entries.length - live.length,
    takingsPence: live.reduce(
      (sum, entry) => sum + entry.services.reduce((s, service) => s + service.pricePence, 0),
      0,
    ),
    minutes: live.reduce(
      (sum, entry) =>
        sum + (new Date(entry.endsAt).getTime() - new Date(entry.startsAt).getTime()) / 60_000,
      0,
    ),
  }
}
