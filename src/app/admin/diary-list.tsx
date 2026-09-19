'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { setAppointmentStatus } from '@/lib/admin/actions'
import type { DiaryEntry, DiaryStatus } from '@/lib/admin/diary'
import { formatPrice } from '@/lib/types'
import { Button, Card } from '@/components/ui'

const STATUS_LABEL: Record<DiaryStatus, string> = {
  confirmed: 'Booked',
  completed: 'Done',
  no_show: 'No-show',
  cancelled: 'Cancelled',
}

const STATUS_STYLE: Record<DiaryStatus, string> = {
  confirmed: 'bg-surface',
  completed: 'bg-surface opacity-70',
  no_show: 'bg-surface opacity-70',
  cancelled: 'bg-surface opacity-50',
}

export function DiaryList({
  entries, timezone,
}: {
  entries: DiaryEntry[]
  timezone: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function update(id: string, status: DiaryStatus) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      const result = await setAppointmentStatus({ appointmentId: id, status })
      if (result.ok) {
        // These pages are force-dynamic, so there is no cache entry for
        // revalidatePath to invalidate. Refresh explicitly.
        router.refresh()
      } else {
        setError(result.error)
      }
      setBusyId(null)
    })
  }

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit',
    })

  if (entries.length === 0) {
    return (
      <p className="mt-8 text-muted">Nothing booked. A quiet one.</p>
    )
  }

  return (
    <section className="mt-8" aria-label="Appointments">
      {error ? (
        <p role="alert" className="mb-3 text-sm font-medium text-red-600">{error}</p>
      ) : null}

      <ul className="space-y-2">
        {entries.map((entry) => {
          const isBusy = busyId === entry.id
          const total = entry.services.reduce((sum, s) => sum + s.pricePence, 0)
          return (
            <li key={entry.id}>
              <Card className={`p-4 ${STATUS_STYLE[entry.status]}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-lg font-semibold tabular-nums">
                    {time(entry.startsAt)}
                    <span className="text-muted"> – {time(entry.endsAt)}</span>
                  </p>
                  <p className="text-sm font-medium">
                    {STATUS_LABEL[entry.status]}
                    {entry.status === 'confirmed' ? null : ' ·'}
                    <span className="text-muted"> {entry.barberName}</span>
                  </p>
                </div>

                <p className="mt-1 font-medium">{entry.customerName}</p>
                <p className="text-sm text-muted">
                  {entry.services.map((s) => s.name).join(' + ')} · {formatPrice(total)}
                </p>

                {entry.customerPhone ? (
                  <a
                    href={`tel:${entry.customerPhone.replace(/\s+/g, '')}`}
                    className="tap mt-1 inline-flex items-center text-sm underline"
                  >
                    {entry.customerPhone}
                  </a>
                ) : null}

                {entry.note ? (
                  <p className="mt-2 rounded-[var(--shop-radius)] bg-[var(--shop-bg)] p-2 text-sm">
                    “{entry.note}”
                  </p>
                ) : null}

                {entry.status === 'confirmed' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" disabled={isBusy}
                      onClick={() => update(entry.id, 'completed')} className="px-3 text-sm">
                      Done
                    </Button>
                    <Button variant="secondary" disabled={isBusy}
                      onClick={() => update(entry.id, 'no_show')} className="px-3 text-sm">
                      No-show
                    </Button>
                    <Button variant="secondary" disabled={isBusy}
                      onClick={() => update(entry.id, 'cancelled')} className="px-3 text-sm">
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3">
                    <Button variant="ghost" disabled={isBusy}
                      onClick={() => update(entry.id, 'confirmed')} className="text-sm">
                      Undo
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
