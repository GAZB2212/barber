'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { addTimeOff, removeTimeOff } from '@/lib/admin/actions'
import type { TimeOffEntry } from '@/lib/admin/queries'
import { Button, Card, TextField } from '@/components/ui'

type Props = {
  entries: TimeOffEntry[]
  timezone: string
  currentStaffId: string
  barbers: { id: string; name: string }[]
}

/**
 * Converts a wall-clock value from a datetime-local input into an instant in
 * the shop's timezone, so a barber on holiday abroad still blocks out the
 * right hours at home.
 */
function toShopInstant(local: string, timezone: string): Date {
  const offsetLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, timeZoneName: 'longOffset',
  }).format(new Date(local)).split(' ').pop() ?? 'GMT'
  const offset = offsetLabel.replace('GMT', '') || '+00:00'
  return new Date(`${local}:00${offset}`)
}

export function TimeOffManager({ entries, timezone, currentStaffId, barbers }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const format = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      timeZone: timezone,
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    })

  function submit(formData: FormData) {
    setError(null)
    const from = String(formData.get('startsAt') ?? '')
    const to = String(formData.get('endsAt') ?? '')
    if (!from || !to) {
      setError('Give a start and an end.')
      return
    }

    const startsAt = toShopInstant(from, timezone)
    const endsAt = toShopInstant(to, timezone)
    if (endsAt <= startsAt) {
      setError('The end must be after the start.')
      return
    }

    startTransition(async () => {
      const result = await addTimeOff({
        barberId: String(formData.get('barberId') ?? ''),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: String(formData.get('reason') ?? ''),
      })
      if (result.ok) router.refresh()
      else setError(result.error)
    })
  }

  function remove(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await removeTimeOff(id)
      if (result.ok) router.refresh()
      else setError(result.error)
    })
  }

  return (
    <div className="mt-6">
      <Card className="p-4">
        <h2 className="font-semibold">Block out time</h2>
        <form action={submit} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="barberId" className="block text-sm font-medium">Who</label>
            <select
              id="barberId" name="barberId" defaultValue={currentStaffId} required
              className="tap w-full rounded-[var(--shop-radius)] border border-edge bg-[var(--shop-bg)] px-3 text-base"
            >
              {barbers.map((barber) => (
                <option key={barber.id} value={barber.id}>{barber.name}</option>
              ))}
            </select>
          </div>

          <TextField id="startsAt" label="From" type="datetime-local" required />
          <TextField id="endsAt" label="Until" type="datetime-local" required />
          <TextField id="reason" label="Reason" autoComplete="off"
            hint="Only the shop sees this." />

          {error ? (
            <p role="alert" className="text-sm font-medium text-red-600">{error}</p>
          ) : null}

          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving…' : 'Block it out'}
          </Button>
        </form>
      </Card>

      <section className="mt-8" aria-label="Upcoming time off">
        <h2 className="font-semibold">Coming up</h2>
        {entries.length === 0 ? (
          <p className="mt-3 text-muted">Nothing blocked out.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {entries.map((entry) => (
              <li key={entry.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{entry.barberName}</p>
                    <p className="text-sm text-muted">
                      {format(entry.startsAt)} → {format(entry.endsAt)}
                    </p>
                    {entry.reason ? (
                      <p className="text-sm text-muted">{entry.reason}</p>
                    ) : null}
                  </div>
                  <Button variant="secondary" disabled={isPending}
                    onClick={() => remove(entry.id)} className="px-3 text-sm">
                    Remove
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
