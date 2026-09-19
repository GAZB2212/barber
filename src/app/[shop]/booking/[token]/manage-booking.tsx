'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { cancelBooking } from '@/lib/booking'
import { formatPrice } from '@/lib/types'
import { Button, Card } from '@/components/ui'

type Props = {
  shopSlug: string
  shopName: string
  shopPhone: string | null
  timezone: string
  cancellationHours: number
  token: string
  startsAt: string
  status: string
  barberName: string
  services: { name: string; price_pence: number }[]
}

export function ManageBooking(props: Props) {
  const [status, setStatus] = useState(props.status)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  const when = new Date(props.startsAt).toLocaleString('en-GB', {
    timeZone: props.timezone,
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  })
  const total = props.services.reduce((sum, s) => sum + s.price_pence, 0)
  const isCancelled = status === 'cancelled'

  function cancel() {
    setError(null)
    startTransition(async () => {
      const result = await cancelBooking(props.token)
      if (result.ok) {
        setStatus('cancelled')
        setConfirming(false)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold sm:text-3xl">
        {isCancelled ? 'Booking cancelled' : 'Your booking'}
      </h1>

      <Card className="mt-6 p-4">
        <p className={`text-lg font-medium ${isCancelled ? 'line-through opacity-60' : ''}`}>
          {when}
        </p>
        {props.barberName ? (
          <p className="text-sm text-muted">with {props.barberName}</p>
        ) : null}

        <ul className="mt-4 space-y-1 text-sm">
          {props.services.map((service, index) => (
            <li key={`${service.name}-${index}`} className="flex justify-between gap-4">
              <span>{service.name}</span>
              <span className="tabular-nums">{formatPrice(service.price_pence)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between border-t border-edge pt-3 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatPrice(total)}</span>
        </p>
      </Card>

      {error ? (
        <p role="alert" className="mt-4 text-sm font-medium text-red-600">{error}</p>
      ) : null}

      {isCancelled ? (
        <div className="mt-8">
          <Link href={`/${props.shopSlug}/book`} className="font-medium underline underline-offset-4">
            Book another appointment
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {confirming ? (
            // An inline confirmation rather than window.confirm or a modal:
            // it cannot be suppressed by the browser and cannot trap scroll.
            <Card className="p-4">
              <p className="font-medium">Cancel this appointment?</p>
              <p className="mt-1 text-sm text-muted">
                This cannot be undone — you would need to book again.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={cancel} disabled={isPending}>
                  {isPending ? 'Cancelling…' : 'Yes, cancel it'}
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)} disabled={isPending}>
                  Keep it
                </Button>
              </div>
            </Card>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Cancel appointment
            </Button>
          )}

          <p className="text-sm text-muted">
            Free to cancel online up to {props.cancellationHours} hours before.
            {props.shopPhone ? (
              <> After that, please call{' '}
                <a
                  className="tap inline-flex items-center underline"
                  href={`tel:${props.shopPhone.replace(/\s+/g, '')}`}
                >
                  {props.shopPhone}
                </a>.
              </>
            ) : null}
          </p>
        </div>
      )}
    </div>
  )
}
