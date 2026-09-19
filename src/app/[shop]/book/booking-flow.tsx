'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { fetchSlots, type DaySlots } from './actions'
import { ANY_BARBER, DAYS_SHOWN } from '@/lib/constants'
import { createBooking } from '@/lib/booking'
import { formatDuration, formatPrice, resolveService, type Barber, type Service, type Shop } from '@/lib/types'
import { Button, Card, TextArea, TextField } from '@/components/ui'

/**
 * The booking flow.
 *
 * Structured as full-page steps rather than a stack of modals. That is the
 * central design decision of this app: a modal on a phone is a scroll trap,
 * and a service list that cannot be scrolled is a shop that cannot be booked.
 * Everything here is ordinary document flow.
 */

type Step = 'services' | 'barber' | 'time' | 'details' | 'done'

const STEP_ORDER: Step[] = ['services', 'barber', 'time', 'details']

type Props = { shop: Shop; services: Service[]; barbers: Barber[] }

export function BookingFlow({ shop, services, barbers }: Props) {
  const [step, setStep] = useState<Step>('services')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [barberId, setBarberId] = useState<string>(ANY_BARBER)
  const [days, setDays] = useState<DaySlots[] | null>(null)
  const [activeDate, setActiveDate] = useState<string | null>(null)
  const [chosenSlot, setChosenSlot] = useState<{ iso: string; barberId: string } | null>(null)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [formError, setFormError] = useState<{ message: string; field?: string } | null>(null)
  const [confirmed, setConfirmed] = useState<{ manageToken: string; startsAt: string } | null>(null)
  const [isLoadingSlots, startLoadingSlots] = useTransition()
  const [isSubmitting, startSubmitting] = useTransition()

  const headingRef = useRef<HTMLHeadingElement>(null)
  const isFirstRender = useRef(true)

  // Move focus to the new step's heading so the flow is navigable by keyboard
  // and announced by a screen reader, without yanking the page on first paint.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    headingRef.current?.focus()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  const selected = useMemo(
    () => selectedIds
      .map((id) => services.find((s) => s.id === id))
      .filter((s): s is Service => Boolean(s)),
    [selectedIds, services],
  )

  // Only offer barbers who can do everything in the basket.
  const eligibleBarbers = useMemo(
    () => barbers.filter(
      (barber) =>
        barber.acceptsBookings &&
        selectedIds.every((id) => barber.serviceIds.includes(id)),
    ),
    [barbers, selectedIds],
  )

  const activeBarber = barbers.find((b) => b.id === barberId) ?? null

  // Prices and durations shown must match the barber actually chosen.
  const summary = useMemo(() => {
    const resolved = activeBarber
      ? selected.map((s) => resolveService(s, activeBarber))
      : selected
    return {
      total: resolved.reduce((sum, s) => sum + s.pricePence, 0),
      minutes: resolved.reduce((sum, s) => sum + s.durationMinutes, 0),
    }
  }, [selected, activeBarber])

  function toggleService(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id)
      if (current.length >= shop.maxServicesPerBooking) return current
      return [...current, id]
    })
    // The basket drives availability, so anything already chosen is now stale.
    setChosenSlot(null)
    setDays(null)
  }

  function loadSlots(forBarberId: string) {
    setSlotsError(null)
    startLoadingSlots(async () => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: shop.timezone })
      const response = await fetchSlots({
        shopSlug: shop.slug,
        barberId: forBarberId,
        serviceIds: selectedIds,
        fromDate: today,
        days: DAYS_SHOWN,
      })
      if (!response.ok) {
        setSlotsError(response.error)
        setDays([])
        return
      }
      setDays(response.days)
      const firstOpen = response.days.find((day) => day.slots.length > 0)
      setActiveDate(firstOpen?.date ?? response.days[0]?.date ?? null)
    })
  }

  function goToTime(forBarberId: string) {
    setBarberId(forBarberId)
    setChosenSlot(null)
    setStep('time')
    loadSlots(forBarberId)
  }

  function submit(formData: FormData) {
    if (!chosenSlot || !activeDate) return
    setFormError(null)
    startSubmitting(async () => {
      const result = await createBooking({
        shopSlug: shop.slug,
        barberId: chosenSlot.barberId,
        serviceIds: selectedIds,
        date: activeDate,
        startsAt: chosenSlot.iso,
        name: String(formData.get('name') ?? ''),
        email: String(formData.get('email') ?? ''),
        phone: String(formData.get('phone') ?? ''),
        note: String(formData.get('note') ?? ''),
      })

      if (result.ok) {
        setConfirmed({ manageToken: result.manageToken, startsAt: result.startsAt })
        setStep('done')
        return
      }

      setFormError({ message: result.error, field: result.field })
      if (result.slotTaken) {
        // Send them back to a freshly loaded list rather than leaving a dead
        // time selected.
        setChosenSlot(null)
        setStep('time')
        loadSlots(barberId)
      }
    })
  }

  const dayTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', {
      timeZone: shop.timezone, hour: '2-digit', minute: '2-digit',
    })

  const longDate = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
      timeZone: shop.timezone, weekday: 'long', day: 'numeric', month: 'long',
    })

  const activeDay = days?.find((day) => day.date === activeDate) ?? null
  const stepIndex = STEP_ORDER.indexOf(step)

  if (step === 'done' && confirmed) {
    return <Confirmation shop={shop} confirmed={confirmed} />
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-40">
      <nav aria-label="Progress" className="pt-6">
        <ol className="flex items-center gap-2 text-xs text-muted">
          {STEP_ORDER.map((name, index) => (
            <li key={name} className="flex items-center gap-2">
              <span
                aria-current={step === name ? 'step' : undefined}
                className={index <= stepIndex ? 'font-semibold text-ink' : ''}
              >
                {index + 1}. {name === 'barber' ? 'Barber' : name === 'time' ? 'Time' : name === 'details' ? 'Details' : 'Services'}
              </span>
              {index < STEP_ORDER.length - 1 ? <span aria-hidden>›</span> : null}
            </li>
          ))}
        </ol>
      </nav>

      <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-bold outline-none sm:text-3xl">
        {step === 'services' && 'What are you having?'}
        {step === 'barber' && 'Who with?'}
        {step === 'time' && 'When suits?'}
        {step === 'details' && 'Your details'}
      </h1>

      {step === 'services' ? (
        <ServiceStep
          services={services}
          selectedIds={selectedIds}
          max={shop.maxServicesPerBooking}
          onToggle={toggleService}
        />
      ) : null}

      {step === 'barber' ? (
        <BarberStep
          barbers={eligibleBarbers}
          selectedIds={selectedIds}
          services={services}
          onChoose={goToTime}
        />
      ) : null}

      {step === 'time' ? (
        <TimeStep
          days={days}
          activeDate={activeDate}
          activeDay={activeDay}
          isLoading={isLoadingSlots}
          error={slotsError}
          chosenIso={chosenSlot?.iso ?? null}
          timezone={shop.timezone}
          onPickDate={(date) => { setActiveDate(date); setChosenSlot(null) }}
          onPickSlot={(iso, slotBarberId) => {
            setChosenSlot({ iso, barberId: slotBarberId })
            setStep('details')
          }}
          formatTime={dayTime}
          formatDate={longDate}
        />
      ) : null}

      {step === 'details' && chosenSlot ? (
        <DetailsStep
          shop={shop}
          barberName={barbers.find((b) => b.id === chosenSlot.barberId)?.name ?? ''}
          whenLabel={`${longDate(activeDate!)} at ${dayTime(chosenSlot.iso)}`}
          services={selected.map((s) =>
            activeBarber ? resolveService(s, activeBarber) : s)}
          error={formError}
          isSubmitting={isSubmitting}
          onSubmit={submit}
        />
      ) : null}

      <SummaryBar
        step={step}
        count={selected.length}
        total={summary.total}
        minutes={summary.minutes}
        canAdvance={selected.length > 0}
        onBack={() => {
          setFormError(null)
          if (step === 'barber') setStep('services')
          if (step === 'time') setStep('barber')
          if (step === 'details') setStep('time')
        }}
        onNext={() => {
          if (step === 'services') setStep('barber')
        }}
      />
    </div>
  )
}

function ServiceStep({
  services, selectedIds, max, onToggle,
}: {
  services: Service[]
  selectedIds: string[]
  max: number
  onToggle: (id: string) => void
}) {
  const atLimit = selectedIds.length >= max
  const categories = services.reduce<Map<string, Service[]>>((acc, service) => {
    const key = service.category ?? 'Services'
    const bucket = acc.get(key)
    if (bucket) bucket.push(service)
    else acc.set(key, [service])
    return acc
  }, new Map())

  return (
    <div className="mt-2">
      <p className="text-sm text-muted">
        Pick up to {max}. Tap to add or remove.
      </p>

      {services.length === 0 ? (
        <p className="mt-6 text-muted">No services are bookable online right now.</p>
      ) : null}

      {/*
        A plain list in normal document flow. No fixed height, no inner scroll
        container, no modal -- the page scrolls, so the list always can.
      */}
      <div className="mt-5 space-y-8">
        {[...categories].map(([category, items]) => (
          <section key={category}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {category}
            </h2>
            <ul className="mt-3 space-y-2">
              {items.map((service) => {
                const isSelected = selectedIds.includes(service.id)
                const isDisabled = !isSelected && atLimit
                return (
                  <li key={service.id}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      disabled={isDisabled}
                      onClick={() => onToggle(service.id)}
                      className={[
                        'tap flex w-full items-start justify-between gap-4 rounded-[var(--shop-radius)]',
                        'border p-4 text-left transition-colors',
                        isSelected
                          ? 'border-[var(--shop-primary)] bg-surface'
                          : 'border-edge hover:bg-surface',
                        isDisabled ? 'cursor-not-allowed opacity-40' : '',
                      ].join(' ')}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 font-medium">
                          <span
                            aria-hidden
                            className={[
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs',
                              isSelected
                                ? 'border-[var(--shop-primary)] bg-brand text-on-brand'
                                : 'border-edge',
                            ].join(' ')}
                          >
                            {isSelected ? '✓' : ''}
                          </span>
                          {service.name}
                        </span>
                        {service.description ? (
                          <span className="mt-1 block text-sm text-muted">
                            {service.description}
                          </span>
                        ) : null}
                        <span className="mt-1 block text-sm text-muted">
                          {formatDuration(service.durationMinutes)}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatPrice(service.pricePence)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      {atLimit ? (
        <p role="status" className="mt-4 text-sm text-muted">
          That is the maximum of {max} services. Remove one to swap it.
        </p>
      ) : null}
    </div>
  )
}

function BarberStep({
  barbers, selectedIds, services, onChoose,
}: {
  barbers: Barber[]
  selectedIds: string[]
  services: Service[]
  onChoose: (barberId: string) => void
}) {
  if (barbers.length === 0) {
    return (
      <p className="mt-6 text-muted">
        Nobody currently offers that combination. Try removing a service.
      </p>
    )
  }

  return (
    <ul className="mt-5 space-y-2">
      <li>
        <button
          type="button"
          onClick={() => onChoose(ANY_BARBER)}
          className="tap flex w-full items-center gap-3 rounded-[var(--shop-radius)] border border-edge p-4 text-left hover:bg-surface"
        >
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-lg text-on-brand"
          >
            ★
          </span>
          <span>
            <span className="block font-medium">Anyone available</span>
            <span className="block text-sm text-muted">Usually the soonest appointment</span>
          </span>
        </button>
      </li>

      {barbers.map((barber) => {
        const extra = selectedIds
          .map((id) => {
            const service = services.find((s) => s.id === id)
            return service ? resolveService(service, barber) : null
          })
          .filter((s): s is NonNullable<typeof s> => Boolean(s))
        const total = extra.reduce((sum, s) => sum + s.pricePence, 0)

        return (
          <li key={barber.id}>
            <button
              type="button"
              onClick={() => onChoose(barber.id)}
              className="tap flex w-full items-center gap-3 rounded-[var(--shop-radius)] border border-edge p-4 text-left hover:bg-surface"
            >
              {barber.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={barber.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
              ) : (
                <span
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand font-semibold text-on-brand"
                >
                  {barber.name.charAt(0)}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{barber.name}</span>
                {barber.bio ? (
                  <span className="block truncate text-sm text-muted">{barber.bio}</span>
                ) : null}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{formatPrice(total)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function TimeStep({
  days, activeDate, activeDay, isLoading, error, chosenIso, onPickDate, onPickSlot,
  formatTime, formatDate, timezone,
}: {
  days: DaySlots[] | null
  activeDate: string | null
  activeDay: DaySlots | null
  isLoading: boolean
  error: string | null
  chosenIso: string | null
  timezone: string
  onPickDate: (date: string) => void
  onPickSlot: (iso: string, barberId: string) => void
  formatTime: (iso: string) => string
  formatDate: (date: string) => string
}) {
  if (error) {
    return <p role="alert" className="mt-6 text-muted">{error}</p>
  }
  if (isLoading && !days) {
    return <p role="status" className="mt-6 text-muted">Finding available times…</p>
  }
  if (!days) return null

  const weekday = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: timezone, weekday: 'short' })
  const dayNumber = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: timezone, day: 'numeric' })

  const anyAvailable = days.some((day) => day.slots.length > 0)

  return (
    <div className="mt-5">
      {/*
        The date strip scrolls horizontally, but the page still scrolls
        vertically underneath: `touch-action` is left alone deliberately so a
        vertical swipe over the strip scrolls the page rather than being eaten.
      */}
      <div
        role="group"
        aria-label="Choose a date"
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2"
      >
        {days.map((day) => {
          const isActive = day.date === activeDate
          const isFull = day.slots.length === 0
          return (
            <button
              key={day.date}
              type="button"
              disabled={isFull}
              aria-pressed={isActive}
              onClick={() => onPickDate(day.date)}
              className={[
                'tap w-16 shrink-0 snap-start rounded-[var(--shop-radius)] border px-2 py-2 text-center',
                isActive ? 'border-[var(--shop-primary)] bg-brand text-on-brand' : 'border-edge',
                isFull ? 'cursor-not-allowed opacity-35' : 'hover:bg-surface',
              ].join(' ')}
            >
              <span className="block text-xs uppercase">{weekday(day.date)}</span>
              <span className="block text-lg font-semibold tabular-nums">{dayNumber(day.date)}</span>
            </button>
          )
        })}
      </div>

      {!anyAvailable ? (
        <p className="mt-8 text-muted">
          No times left in the next fortnight. Please call the shop.
        </p>
      ) : null}

      {activeDay ? (
        <section className="mt-6" aria-live="polite">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {formatDate(activeDay.date)}
          </h2>

          {isLoading ? (
            <p className="mt-3 text-muted">Refreshing…</p>
          ) : activeDay.slots.length === 0 ? (
            <p className="mt-3 text-muted">Fully booked. Try another day.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {activeDay.slots.map((iso, index) => (
                <li key={iso}>
                  <button
                    type="button"
                    aria-pressed={chosenIso === iso}
                    onClick={() => onPickSlot(iso, activeDay.barberIds[index])}
                    className={[
                      'tap w-full rounded-[var(--shop-radius)] border tabular-nums',
                      chosenIso === iso
                        ? 'border-[var(--shop-primary)] bg-brand text-on-brand'
                        : 'border-edge hover:bg-surface',
                    ].join(' ')}
                  >
                    {formatTime(iso)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  )
}

function DetailsStep({
  shop, barberName, whenLabel, services, error, isSubmitting, onSubmit,
}: {
  shop: Shop
  barberName: string
  whenLabel: string
  services: { id: string; name: string; pricePence: number; durationMinutes: number }[]
  error: { message: string; field?: string } | null
  isSubmitting: boolean
  onSubmit: (formData: FormData) => void
}) {
  const total = services.reduce((sum, s) => sum + s.pricePence, 0)

  return (
    <div className="mt-5">
      <Card className="p-4">
        <p className="font-medium">{whenLabel}</p>
        <p className="text-sm text-muted">with {barberName}</p>
        <ul className="mt-3 space-y-1 text-sm">
          {services.map((service) => (
            <li key={service.id} className="flex justify-between gap-4">
              <span>{service.name}</span>
              <span className="tabular-nums">{formatPrice(service.pricePence)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between border-t border-edge pt-3 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatPrice(total)}</span>
        </p>
        <p className="mt-2 text-xs text-muted">Pay in the shop.</p>
      </Card>

      <form action={onSubmit} className="mt-6 space-y-4">
        <TextField
          id="name"
          label="Your name"
          required
          autoComplete="name"
          error={error?.field === 'name' ? error.message : undefined}
        />

        <TextField
          id="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          hint="We'll send your confirmation and a link to cancel."
          error={error?.field === 'email' ? error.message : undefined}
        />

        <TextField
          id="phone"
          label="Mobile"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          hint="Optional if you gave an email."
          error={error?.field === 'phone' ? error.message : undefined}
        />

        <TextArea
          id="note"
          label="Anything we should know?"
          rows={3}
          maxLength={500}
          placeholder="Optional"
        />

        {error && !error.field ? (
          <p role="alert" className="text-sm font-medium text-red-600">{error.message}</p>
        ) : null}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Confirming…' : 'Confirm booking'}
        </Button>

        <p className="text-center text-xs text-muted">
          Free to cancel up to {shop.cancellationHours} hours before.
        </p>
      </form>
    </div>
  )
}

function SummaryBar({
  step, count, total, minutes, canAdvance, onBack, onNext,
}: {
  step: Step
  count: number
  total: number
  minutes: number
  canAdvance: boolean
  onBack: () => void
  onNext: () => void
}) {
  if (step === 'done') return null
  const showNext = step === 'services'

  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-edge bg-[var(--shop-bg)] px-4 pt-3">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        {step !== 'services' ? (
          <Button variant="secondary" onClick={onBack} className="px-4">Back</Button>
        ) : (
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">
              {count === 0 ? 'Nothing selected' : `${count} service${count > 1 ? 's' : ''}`}
            </p>
            {count > 0 ? (
              <p className="text-muted">
                {formatPrice(total)} · {formatDuration(minutes)}
              </p>
            ) : null}
          </div>
        )}

        {step !== 'services' ? (
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{formatPrice(total)}</p>
            <p className="text-muted">{formatDuration(minutes)}</p>
          </div>
        ) : null}

        {showNext ? (
          <Button onClick={onNext} disabled={!canAdvance} className="shrink-0">
            Continue
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function Confirmation({
  shop, confirmed,
}: {
  shop: Shop
  confirmed: { manageToken: string; startsAt: string }
}) {
  const when = new Date(confirmed.startsAt).toLocaleString('en-GB', {
    timeZone: shop.timezone,
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold sm:text-3xl">You’re booked in</h1>
      <p className="mt-2 text-lg">{when}</p>
      <Card className="mt-6 p-4 text-sm">
        <p>
          Keep this link to change or cancel your appointment — we’ve emailed it
          to you too.
        </p>
        <Link
          href={`/${shop.slug}/booking/${confirmed.manageToken}`}
          className="mt-2 inline-block font-medium underline underline-offset-4"
        >
          Manage this booking
        </Link>
      </Card>
      <div className="mt-8">
        <Link href={`/${shop.slug}`} className="font-medium underline underline-offset-4">
          Back to {shop.name}
        </Link>
      </div>
    </div>
  )
}
