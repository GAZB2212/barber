import Link from 'next/link'
import { requireSession } from '@/lib/auth'
import { getDiary, diaryTotals } from '@/lib/admin/diary'
import { getBarbers, getServices } from '@/lib/shop'
import { demoBarbers, demoServices } from '@/lib/demo'
import { localDateOf } from '@/lib/availability'
import { formatDuration, formatPrice } from '@/lib/types'
import { Card } from '@/components/ui'
import { DiaryList } from './diary-list'
import { WalkInPanel } from './walk-in-panel'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; barber?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams

  const today = localDateOf(new Date(), session.shop.timezone)
  const date = params.date && DATE_RE.test(params.date) ? params.date : today

  const [entries, barbers, services] = await Promise.all([
    getDiary(session, date),
    session.isDemo ? demoBarbers : getBarbers(session.shop.id),
    session.isDemo ? demoServices : getServices(session.shop.id),
  ])

  const barberFilter = params.barber && params.barber !== 'all' ? params.barber : null
  const visible = barberFilter
    ? entries.filter((entry) => entry.barberId === barberFilter)
    : entries
  const totals = diaryTotals(visible)

  const href = (next: { date?: string; barber?: string }) => {
    const query = new URLSearchParams()
    query.set('date', next.date ?? date)
    if (next.barber ?? barberFilter) query.set('barber', next.barber ?? barberFilter!)
    return `/admin?${query}`
  }

  const heading = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: session.shop.timezone,
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">{heading}</h1>
        {date !== today ? (
          <Link href={href({ date: today })} className="text-sm underline underline-offset-4">
            Back to today
          </Link>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={href({ date: shiftDate(date, -1) })}
          className="tap inline-flex items-center rounded-[var(--shop-radius)] border border-edge px-4"
          aria-label="Previous day"
        >
          ‹ Prev
        </Link>
        <Link
          href={href({ date: shiftDate(date, 1) })}
          className="tap inline-flex items-center rounded-[var(--shop-radius)] border border-edge px-4"
          aria-label="Next day"
        >
          Next ›
        </Link>

        <nav aria-label="Filter by barber" className="flex flex-wrap gap-1">
          <Link
            href={href({ barber: 'all' })}
            aria-current={!barberFilter ? 'true' : undefined}
            className={[
              'tap inline-flex items-center rounded-[var(--shop-radius)] border px-3 text-sm',
              !barberFilter ? 'border-[var(--shop-primary)] bg-brand text-on-brand' : 'border-edge',
            ].join(' ')}
          >
            Everyone
          </Link>
          {barbers.map((barber) => (
            <Link
              key={barber.id}
              href={href({ barber: barber.id })}
              aria-current={barberFilter === barber.id ? 'true' : undefined}
              className={[
                'tap inline-flex items-center rounded-[var(--shop-radius)] border px-3 text-sm',
                barberFilter === barber.id
                  ? 'border-[var(--shop-primary)] bg-brand text-on-brand'
                  : 'border-edge',
              ].join(' ')}
            >
              {barber.name}
            </Link>
          ))}
        </nav>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2">
        <Card className="p-3">
          <dt className="text-xs uppercase tracking-wide text-muted">Booked</dt>
          <dd className="text-xl font-semibold tabular-nums">{totals.booked}</dd>
        </Card>
        <Card className="p-3">
          <dt className="text-xs uppercase tracking-wide text-muted">In the chair</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {formatDuration(Math.round(totals.minutes))}
          </dd>
        </Card>
        <Card className="p-3">
          <dt className="text-xs uppercase tracking-wide text-muted">Takings</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {formatPrice(totals.takingsPence)}
          </dd>
        </Card>
      </dl>

      <WalkInPanel
        date={date}
        timezone={session.shop.timezone}
        barbers={barbers.map((b) => ({ id: b.id, name: b.name }))}
        services={services.map((s) => ({
          id: s.id, name: s.name, durationMinutes: s.durationMinutes, pricePence: s.pricePence,
        }))}
      />

      <DiaryList entries={visible} timezone={session.shop.timezone} />
    </div>
  )
}
