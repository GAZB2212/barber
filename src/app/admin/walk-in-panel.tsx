'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createWalkIn } from '@/lib/admin/actions'
import { formatPrice } from '@/lib/types'
import { Button, Card, TextField } from '@/components/ui'

type Props = {
  date: string
  timezone: string
  barbers: { id: string; name: string }[]
  services: { id: string; name: string; durationMinutes: number; pricePence: number }[]
}

/**
 * Booking someone in from behind the chair.
 *
 * Collapsed by default and expanded inline -- not a modal, so the diary stays
 * visible and scrollable underneath while the barber types.
 */
export function WalkInPanel({ date, timezone, barbers, services }: Props) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()

  function submit(formData: FormData) {
    setError(null)
    if (selected.length === 0) {
      setError('Pick at least one service.')
      return
    }

    const time = String(formData.get('time') ?? '')
    if (!/^\d{2}:\d{2}$/.test(time)) {
      setError('Enter a time like 14:30.')
      return
    }

    // Interpret the typed wall-clock time in the shop's timezone, whatever
    // timezone the barber's own device happens to be set to.
    const local = new Date(`${date}T${time}:00`)
    const offsetLabel = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, timeZoneName: 'longOffset',
    }).format(local).split(' ').pop() ?? 'GMT'
    const offset = offsetLabel.replace('GMT', '') || '+00:00'
    const startsAt = new Date(`${date}T${time}:00${offset}`)

    if (Number.isNaN(startsAt.getTime())) {
      setError('Enter a time like 14:30.')
      return
    }

    startTransition(async () => {
      const result = await createWalkIn({
        barberId: String(formData.get('barberId') ?? ''),
        serviceIds: selected,
        startsAt: startsAt.toISOString(),
        name: String(formData.get('name') ?? ''),
        phone: String(formData.get('phone') ?? ''),
        note: String(formData.get('note') ?? ''),
      })
      if (result.ok) {
        setIsOpen(false)
        setSelected([])
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  if (!isOpen) {
    return (
      <div className="mt-5">
        <Button onClick={() => setIsOpen(true)}>Book someone in</Button>
      </div>
    )
  }

  return (
    <Card className="mt-5 p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold">Book someone in</h2>
        <Button variant="ghost" onClick={() => setIsOpen(false)} className="text-sm">
          Close
        </Button>
      </div>

      <form action={submit} className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="barberId" className="block text-sm font-medium">Barber</label>
          <select
            id="barberId"
            name="barberId"
            required
            className="tap w-full rounded-[var(--shop-radius)] border border-edge bg-[var(--shop-bg)] px-3 text-base"
          >
            {barbers.map((barber) => (
              <option key={barber.id} value={barber.id}>{barber.name}</option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Services</legend>
          <ul className="mt-2 flex flex-wrap gap-2">
            {services.map((service) => {
              const isOn = selected.includes(service.id)
              return (
                <li key={service.id}>
                  <button
                    type="button"
                    aria-pressed={isOn}
                    onClick={() =>
                      setSelected((current) =>
                        current.includes(service.id)
                          ? current.filter((id) => id !== service.id)
                          : [...current, service.id])}
                    className={[
                      'tap rounded-[var(--shop-radius)] border px-3 text-sm',
                      isOn ? 'border-[var(--shop-primary)] bg-brand text-on-brand' : 'border-edge',
                    ].join(' ')}
                  >
                    {service.name} · {formatPrice(service.pricePence)}
                  </button>
                </li>
              )
            })}
          </ul>
        </fieldset>

        <TextField id="time" label="Start time" placeholder="14:30"
          inputMode="numeric" pattern="[0-9]{2}:[0-9]{2}" required
          hint="Opening hours and notice periods do not apply here." />
        <TextField id="name" label="Customer name" required autoComplete="off" />
        <TextField id="phone" label="Phone" type="tel" inputMode="tel" autoComplete="off" />
        <TextField id="note" label="Note" autoComplete="off" />

        {error ? (
          <p role="alert" className="text-sm font-medium text-red-600">{error}</p>
        ) : null}

        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Add to the diary'}
        </Button>
      </form>
    </Card>
  )
}
