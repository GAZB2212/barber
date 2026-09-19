'use server'

import { z } from 'zod'
import { getBarbers, getServices, getShopBySlug, dateRange, getSlotsForRange } from '@/lib/shop'
import { resolveService } from '@/lib/types'
import { totalDuration } from '@/lib/availability'
import { ANY_BARBER } from '@/lib/constants'

const schema = z.object({
  shopSlug: z.string().min(1),
  barberId: z.string(),
  serviceIds: z.array(z.string().uuid()).min(1),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().int().min(1).max(31),
})

export type DaySlots = {
  date: string
  /** ISO start instants. */
  slots: string[]
  /** Which barber each slot belongs to, aligned with `slots`. */
  barberIds: string[]
}

export type SlotsResponse =
  | { ok: true; days: DaySlots[] }
  | { ok: false; error: string }

/**
 * Offered times for a range of days.
 *
 * With `ANY_BARBER` this merges every eligible barber's availability and keeps
 * one barber per distinct start time, so the customer sees a clean list of
 * times rather than the same 10:15 repeated four times.
 */
export async function fetchSlots(raw: z.input<typeof schema>): Promise<SlotsResponse> {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'That request was not valid.' }
  const input = parsed.data

  const shop = await getShopBySlug(input.shopSlug)
  if (!shop) return { ok: false, error: 'We could not find that shop.' }

  const [barbers, services] = await Promise.all([
    getBarbers(shop.id),
    getServices(shop.id),
  ])

  const eligible = barbers.filter(
    (barber) =>
      barber.acceptsBookings &&
      input.serviceIds.every((id) => barber.serviceIds.includes(id)) &&
      (input.barberId === ANY_BARBER || barber.id === input.barberId),
  )
  if (eligible.length === 0) {
    return { ok: false, error: 'Nobody currently offers that combination of services.' }
  }

  const dates = dateRange(input.fromDate, input.days)
  const now = new Date()

  // Each barber may have their own duration overrides, so the length of the
  // appointment is computed per barber rather than once up front.
  const perBarber = await Promise.all(
    eligible.map(async (barber) => {
      const chosen = input.serviceIds
        .map((id) => services.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .map((service) => resolveService(service, barber))

      if (chosen.length !== input.serviceIds.length) return { barber, byDate: {} }

      const duration = totalDuration(
        chosen.map((s) => ({
          durationMinutes: s.durationMinutes,
          bufferAfterMinutes: s.bufferAfterMinutes,
        })),
      )
      return {
        barber,
        byDate: await getSlotsForRange(shop, barber.id, dates, duration, now),
      }
    }),
  )

  const days: DaySlots[] = dates.map((date) => {
    // Keep the first barber offering each time; `eligible` is in the shop's
    // own display order, so that is a deliberate choice rather than a race.
    const claimed = new Map<number, string>()
    for (const { barber, byDate } of perBarber) {
      for (const slot of byDate[date] ?? []) {
        const key = slot.getTime()
        if (!claimed.has(key)) claimed.set(key, barber.id)
      }
    }
    const times = [...claimed.keys()].sort((a, b) => a - b)
    return {
      date,
      slots: times.map((ms) => new Date(ms).toISOString()),
      barberIds: times.map((ms) => claimed.get(ms)!),
    }
  })

  return { ok: true, days }
}
