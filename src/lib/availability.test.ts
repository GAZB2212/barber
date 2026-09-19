import { describe, expect, it } from 'vitest'
import {
  daysBetween,
  isSlotBookable,
  localDateOf,
  mergeIntervals,
  parseTimeToMinutes,
  resolveOpeningWindows,
  slotsForDay,
  totalDuration,
  weekdayOf,
  type AvailabilityInput,
  type OpeningWindow,
} from './availability'

const LONDON = 'Europe/London'

/** Mon-Sat 09:00-17:00. 2026-01-05 is a Monday. */
const weekdayHours: OpeningWindow[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  opensAt: '09:00',
  closesAt: '17:00',
}))

function input(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    date: '2026-01-05',
    timezone: LONDON,
    durationMinutes: 30,
    slotIntervalMinutes: 15,
    leadTimeMinutes: 0,
    horizonDays: 60,
    now: new Date('2026-01-01T09:00:00Z'),
    openingWindows: weekdayHours,
    closedDates: [],
    busy: [],
    ...overrides,
  }
}

const hhmm = (d: Date) =>
  d.toLocaleTimeString('en-GB', { timeZone: LONDON, hour: '2-digit', minute: '2-digit' })

describe('parseTimeToMinutes', () => {
  it('accepts HH:MM and HH:MM:SS', () => {
    expect(parseTimeToMinutes('09:00')).toBe(540)
    expect(parseTimeToMinutes('09:30:00')).toBe(570)
    expect(parseTimeToMinutes('00:00')).toBe(0)
    expect(parseTimeToMinutes('23:59')).toBe(1439)
  })

  it('rejects nonsense', () => {
    expect(() => parseTimeToMinutes('9:00')).toThrow()
    expect(() => parseTimeToMinutes('25:00')).toThrow()
    expect(() => parseTimeToMinutes('09:60')).toThrow()
    expect(() => parseTimeToMinutes('')).toThrow()
  })
})

describe('mergeIntervals', () => {
  const at = (iso: string) => new Date(iso)

  it('merges overlapping and touching windows', () => {
    const merged = mergeIntervals([
      { start: at('2026-01-05T10:00:00Z'), end: at('2026-01-05T10:30:00Z') },
      { start: at('2026-01-05T10:15:00Z'), end: at('2026-01-05T11:00:00Z') },
      { start: at('2026-01-05T11:00:00Z'), end: at('2026-01-05T11:30:00Z') },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].end.toISOString()).toBe('2026-01-05T11:30:00.000Z')
  })

  it('keeps disjoint windows apart and sorts them', () => {
    const merged = mergeIntervals([
      { start: at('2026-01-05T14:00:00Z'), end: at('2026-01-05T15:00:00Z') },
      { start: at('2026-01-05T10:00:00Z'), end: at('2026-01-05T11:00:00Z') },
    ])
    expect(merged).toHaveLength(2)
    expect(merged[0].start.toISOString()).toBe('2026-01-05T10:00:00.000Z')
  })

  it('swallows a window fully inside another', () => {
    const merged = mergeIntervals([
      { start: at('2026-01-05T09:00:00Z'), end: at('2026-01-05T17:00:00Z') },
      { start: at('2026-01-05T12:00:00Z'), end: at('2026-01-05T12:30:00Z') },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].end.toISOString()).toBe('2026-01-05T17:00:00.000Z')
  })

  it('does not mutate its input', () => {
    const original = [
      { start: at('2026-01-05T10:00:00Z'), end: at('2026-01-05T10:30:00Z') },
      { start: at('2026-01-05T10:15:00Z'), end: at('2026-01-05T11:00:00Z') },
    ]
    mergeIntervals(original)
    expect(original[0].end.toISOString()).toBe('2026-01-05T10:30:00.000Z')
  })

  it('handles an empty list', () => {
    expect(mergeIntervals([])).toEqual([])
  })
})

describe('slotsForDay', () => {
  it('fills the day at the slot interval', () => {
    const slots = slotsForDay(input())
    // 09:00-17:00, 30min service, 15min interval: 09:00..16:30 inclusive.
    expect(slots).toHaveLength(31)
    expect(hhmm(slots[0])).toBe('09:00')
    expect(hhmm(slots.at(-1)!)).toBe('16:30')
  })

  it('never offers a slot that would overrun closing time', () => {
    const slots = slotsForDay(input({ durationMinutes: 90 }))
    expect(hhmm(slots.at(-1)!)).toBe('15:30')
  })

  it('aligns to the opening time, not the clock hour', () => {
    const slots = slotsForDay(input({
      openingWindows: [{ weekday: 1, opensAt: '09:30', closesAt: '17:00' }],
    }))
    expect(hhmm(slots[0])).toBe('09:30')
    expect(hhmm(slots[1])).toBe('09:45')
  })

  it('excludes slots overlapping a booking, and frees the end instant', () => {
    const slots = slotsForDay(input({
      busy: [{
        start: new Date('2026-01-05T10:00:00Z'),
        end: new Date('2026-01-05T10:30:00Z'),
      }],
    }))
    const times = slots.map(hhmm)
    expect(times).not.toContain('09:45') // would run into 10:00
    expect(times).not.toContain('10:00')
    expect(times).not.toContain('10:15')
    expect(times).toContain('09:30') // ends exactly at 10:00
    expect(times).toContain('10:30') // starts exactly at the end
  })

  it('supports split shifts with a lunch break', () => {
    const slots = slotsForDay(input({
      openingWindows: [
        { weekday: 1, opensAt: '09:00', closesAt: '13:00' },
        { weekday: 1, opensAt: '14:00', closesAt: '17:00' },
      ],
    }))
    const times = slots.map(hhmm)
    expect(times).toContain('12:30')
    expect(times).not.toContain('13:00')
    expect(times).not.toContain('13:30')
    expect(times).toContain('14:00')
    // ...and the result stays in ascending order across both windows.
    const ms = slots.map((s) => s.getTime())
    expect([...ms].sort((a, b) => a - b)).toEqual(ms)
  })

  it('honours lead time', () => {
    const slots = slotsForDay(input({
      now: new Date('2026-01-05T09:00:00Z'), // 09:00 London in January
      leadTimeMinutes: 90,
    }))
    expect(hhmm(slots[0])).toBe('10:30')
  })

  it('returns nothing for a past date', () => {
    expect(slotsForDay(input({ now: new Date('2026-01-06T09:00:00Z') }))).toEqual([])
  })

  it('returns nothing beyond the booking horizon', () => {
    expect(slotsForDay(input({ date: '2026-03-30', horizonDays: 30 }))).toEqual([])
  })

  it('allows the last day of the horizon', () => {
    // 2026-01-01 + 60 days = 2026-03-02, a Monday.
    expect(slotsForDay(input({ date: '2026-03-02' })).length).toBeGreaterThan(0)
  })

  it('returns nothing on a closure date', () => {
    expect(slotsForDay(input({ closedDates: ['2026-01-05'] }))).toEqual([])
  })

  it('returns nothing on a weekday with no opening hours', () => {
    expect(slotsForDay(input({ date: '2026-01-04' }))).toEqual([]) // Sunday
  })

  it('returns nothing when a full-day absence covers the day', () => {
    const slots = slotsForDay(input({
      busy: [{
        start: new Date('2026-01-05T00:00:00Z'),
        end: new Date('2026-01-06T00:00:00Z'),
      }],
    }))
    expect(slots).toEqual([])
  })

  it('rejects a zero or negative duration rather than looping forever', () => {
    expect(slotsForDay(input({ durationMinutes: 0 }))).toEqual([])
    expect(slotsForDay(input({ slotIntervalMinutes: 0 }))).toEqual([])
  })
})

describe('British Summer Time', () => {
  // The UK moves to BST on 2026-03-29 and back on 2026-10-25, both Sundays.
  const sundayHours: OpeningWindow[] = [{ weekday: 0, opensAt: '09:00', closesAt: '17:00' }]

  it('keeps wall-clock times stable on the spring-forward day', () => {
    const slots = slotsForDay(input({
      date: '2026-03-29',
      now: new Date('2026-03-01T09:00:00Z'),
      openingWindows: sundayHours,
    }))
    expect(hhmm(slots[0])).toBe('09:00')
    expect(hhmm(slots.at(-1)!)).toBe('16:30')
    // 09:00 local is 08:00 UTC once the clocks have gone forward.
    expect(slots[0].toISOString()).toBe('2026-03-29T08:00:00.000Z')
  })

  it('keeps wall-clock times stable on the autumn fall-back day', () => {
    const slots = slotsForDay(input({
      date: '2026-10-25',
      now: new Date('2026-10-01T09:00:00Z'),
      horizonDays: 60,
      openingWindows: sundayHours,
    }))
    expect(hhmm(slots[0])).toBe('09:00')
    expect(slots[0].toISOString()).toBe('2026-10-25T09:00:00.000Z') // back to GMT
  })

  it('offers a full day of slots across the transition, not one hour short', () => {
    const normal = slotsForDay(input({
      date: '2026-04-05', // the Sunday after the change
      now: new Date('2026-03-01T09:00:00Z'),
      openingWindows: sundayHours,
    }))
    const transition = slotsForDay(input({
      date: '2026-03-29',
      now: new Date('2026-03-01T09:00:00Z'),
      openingWindows: sundayHours,
    }))
    expect(transition).toHaveLength(normal.length)
  })
})

describe('localDateOf / weekdayOf / daysBetween', () => {
  it('resolves the local date across the UTC boundary', () => {
    // 23:30 UTC in July is 00:30 the next day in London.
    expect(localDateOf(new Date('2026-07-14T23:30:00Z'), LONDON)).toBe('2026-07-15')
    expect(localDateOf(new Date('2026-01-14T23:30:00Z'), LONDON)).toBe('2026-01-14')
  })

  it('reads weekdays with Sunday as 0', () => {
    expect(weekdayOf('2026-01-04', LONDON)).toBe(0)
    expect(weekdayOf('2026-01-05', LONDON)).toBe(1)
    expect(weekdayOf('2026-01-10', LONDON)).toBe(6)
  })

  it('counts days across a DST change', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-01-05', '2026-01-05')).toBe(0)
    expect(daysBetween('2026-01-06', '2026-01-05')).toBe(-1)
  })
})

describe('resolveOpeningWindows', () => {
  it('lets a barber replace the shop default for their own weekdays', () => {
    const resolved = resolveOpeningWindows(weekdayHours, [
      { weekday: 4, opensAt: '12:00', closesAt: '20:00' },
    ])
    expect(resolved.filter((w) => w.weekday === 4)).toEqual([
      { weekday: 4, opensAt: '12:00', closesAt: '20:00' },
    ])
    expect(resolved.filter((w) => w.weekday === 1)).toHaveLength(1)
    expect(resolved).toHaveLength(6)
  })

  it('lets a barber close a day the shop is open by overriding with nothing', () => {
    const resolved = resolveOpeningWindows(weekdayHours, [])
    expect(resolved).toHaveLength(6)
  })

  it('keeps multiple override windows for one day', () => {
    const resolved = resolveOpeningWindows(weekdayHours, [
      { weekday: 2, opensAt: '09:00', closesAt: '12:00' },
      { weekday: 2, opensAt: '13:00', closesAt: '17:00' },
    ])
    expect(resolved.filter((w) => w.weekday === 2)).toHaveLength(2)
  })
})

describe('totalDuration', () => {
  it('adds durations and trailing buffers', () => {
    expect(totalDuration([
      { durationMinutes: 30, bufferAfterMinutes: 5 },
      { durationMinutes: 15 },
    ])).toBe(50)
    expect(totalDuration([])).toBe(0)
  })
})

describe('isSlotBookable', () => {
  it('agrees with the offered list', () => {
    const args = input()
    const [first] = slotsForDay(args)
    expect(isSlotBookable(first, args)).toBe(true)
  })

  it('rejects a time that is not on the grid', () => {
    expect(isSlotBookable(new Date('2026-01-05T09:07:00Z'), input())).toBe(false)
  })

  it('rejects a slot taken between listing and booking', () => {
    const taken = new Date('2026-01-05T10:00:00Z')
    expect(isSlotBookable(taken, input({
      busy: [{ start: taken, end: new Date('2026-01-05T10:30:00Z') }],
    }))).toBe(false)
  })
})
