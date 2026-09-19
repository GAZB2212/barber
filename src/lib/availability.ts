import { TZDate } from '@date-fns/tz'

/**
 * Slot computation.
 *
 * Deliberately pure: no database, no clock of its own, no framework. Every
 * input is passed in, so the whole thing is trivially testable and runs
 * identically on the server (offering slots) and at booking time
 * (re-validating the chosen slot before insert).
 *
 * All wall-clock reasoning happens in the shop's timezone; every value that
 * crosses the boundary is an absolute `Date`.
 */

export type Interval = { start: Date; end: Date }

/** A recurring opening window, in shop-local wall-clock time. */
export type OpeningWindow = {
  /** 0 = Sunday, matching Postgres `extract(dow)` and `Date#getDay`. */
  weekday: number
  /** 'HH:MM' or 'HH:MM:SS'. */
  opensAt: string
  /** 'HH:MM' or 'HH:MM:SS'. Must be later than opensAt. */
  closesAt: string
}

export type AvailabilityInput = {
  /** Calendar date in the shop's timezone, 'YYYY-MM-DD'. */
  date: string
  timezone: string
  /** Total minutes the barber is occupied, including trailing buffers. */
  durationMinutes: number
  /** Granularity of offered start times. */
  slotIntervalMinutes: number
  /** Minimum notice before a booking may start. */
  leadTimeMinutes: number
  /** How many days ahead booking is allowed, counted from today. */
  horizonDays: number
  /** Current instant. Injected so tests are deterministic. */
  now: Date
  /** Already resolved for the specific barber (see `resolveOpeningWindows`). */
  openingWindows: OpeningWindow[]
  /** Whole-shop closure dates, 'YYYY-MM-DD'. */
  closedDates: readonly string[]
  /** Appointments and time off, merged by the caller. */
  busy: readonly Interval[]
}

const MINUTE_MS = 60_000

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/

/** Minutes from local midnight. Accepts 'HH:MM' and 'HH:MM:SS'. */
export function parseTimeToMinutes(value: string): number {
  const match = TIME_RE.exec(value)
  if (!match) throw new Error(`Invalid time: ${value}`)
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) throw new Error(`Invalid time: ${value}`)
  return hours * 60 + minutes
}

/**
 * The instant at which `minutesFromMidnight` falls on `date` in `timezone`.
 *
 * Stepping in wall-clock minutes and converting each one -- rather than adding
 * real milliseconds to a start instant -- is what makes this correct across a
 * DST change: on the day the UK clocks go back, 09:00 and 17:00 local are 9
 * real hours apart, not 8, and slots still land on the times a customer sees.
 */
function instantAt(date: string, minutesFromMidnight: number, timezone: string): Date {
  if (!DATE_RE.test(date)) throw new Error(`Invalid date: ${date}`)
  const [year, month, day] = date.split('-').map(Number)
  const hours = Math.floor(minutesFromMidnight / 60)
  const minutes = minutesFromMidnight % 60
  return new Date(
    new TZDate(year, month - 1, day, hours, minutes, 0, 0, timezone).getTime(),
  )
}

/** Calendar date in `timezone` for an instant, as 'YYYY-MM-DD'. */
export function localDateOf(instant: Date, timezone: string): string {
  const zoned = new TZDate(instant.getTime(), timezone)
  const year = String(zoned.getFullYear()).padStart(4, '0')
  const month = String(zoned.getMonth() + 1).padStart(2, '0')
  const day = String(zoned.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Weekday (0 = Sunday) of a 'YYYY-MM-DD' date, free of timezone drift. */
export function weekdayOf(date: string, timezone: string): number {
  return new TZDate(instantAt(date, 12 * 60, timezone).getTime(), timezone).getDay()
}

/** Whole days between two local dates, `to - from`. */
export function daysBetween(from: string, to: string): number {
  const asUtc = (d: string) => {
    const [y, m, day] = d.split('-').map(Number)
    return Date.UTC(y, m - 1, day)
  }
  return Math.round((asUtc(to) - asUtc(from)) / 86_400_000)
}

/**
 * Collapse overlapping or touching intervals, so slot checking is a single
 * ordered pass rather than a comparison against every booking.
 */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime())
  const merged: Interval[] = [{ ...sorted[0] }]
  for (const current of sorted.slice(1)) {
    const last = merged[merged.length - 1]
    if (current.start.getTime() <= last.end.getTime()) {
      if (current.end.getTime() > last.end.getTime()) last.end = current.end
    } else {
      merged.push({ ...current })
    }
  }
  return merged
}

function overlapsBusy(start: number, end: number, busy: readonly Interval[]): boolean {
  // Half-open [start, end): a booking ending at 10:00 frees 10:00 itself.
  for (const window of busy) {
    const windowStart = window.start.getTime()
    if (windowStart >= end) break // sorted, so nothing later can overlap
    if (windowStart < end && window.end.getTime() > start) return true
  }
  return false
}

/**
 * Bookable start instants for one day, ascending.
 *
 * Returns `[]` rather than throwing for any "not bookable" reason (past date,
 * beyond the horizon, closed, no hours) -- callers render an empty day.
 */
export function slotsForDay(input: AvailabilityInput): Date[] {
  const {
    date, timezone, durationMinutes, slotIntervalMinutes, leadTimeMinutes,
    horizonDays, now, openingWindows, closedDates, busy,
  } = input

  if (durationMinutes <= 0 || slotIntervalMinutes <= 0) return []

  const today = localDateOf(now, timezone)
  const offset = daysBetween(today, date)
  if (offset < 0 || offset > horizonDays) return []
  if (closedDates.includes(date)) return []

  const weekday = weekdayOf(date, timezone)
  const windows = openingWindows.filter((w) => w.weekday === weekday)
  if (windows.length === 0) return []

  const mergedBusy = mergeIntervals(busy)
  const earliest = now.getTime() + leadTimeMinutes * MINUTE_MS
  const slots: Date[] = []

  for (const window of windows) {
    const opensAt = parseTimeToMinutes(window.opensAt)
    const closesAt = parseTimeToMinutes(window.closesAt)
    if (closesAt <= opensAt) continue

    // Offered times align to the window's own opening, so a shop opening at
    // 09:30 offers 09:30/09:45/10:00 rather than an unreachable 09:00.
    for (
      let minute = opensAt;
      minute + durationMinutes <= closesAt;
      minute += slotIntervalMinutes
    ) {
      const start = instantAt(date, minute, timezone)
      const startMs = start.getTime()
      if (startMs < earliest) continue

      const endMs = instantAt(date, minute + durationMinutes, timezone).getTime()
      if (overlapsBusy(startMs, endMs, mergedBusy)) continue

      slots.push(start)
    }
  }

  slots.sort((a, b) => a.getTime() - b.getTime())
  return slots
}

/** True if `start` is a slot the shop would currently offer. */
export function isSlotBookable(start: Date, input: AvailabilityInput): boolean {
  return slotsForDay(input).some((slot) => slot.getTime() === start.getTime())
}

/**
 * Pick the opening windows that apply to one barber.
 *
 * A barber's own rows replace the shop default for the weekdays they cover, so
 * a barber who works late on Thursday needs one row, not a full week.
 */
export function resolveOpeningWindows(
  shopWindows: readonly OpeningWindow[],
  staffWindows: readonly OpeningWindow[],
): OpeningWindow[] {
  const overriddenDays = new Set(staffWindows.map((w) => w.weekday))
  return [
    ...shopWindows.filter((w) => !overriddenDays.has(w.weekday)),
    ...staffWindows,
  ]
}

/** Minutes a barber is occupied by a set of services, buffers included. */
export function totalDuration(
  services: readonly { durationMinutes: number; bufferAfterMinutes?: number }[],
): number {
  return services.reduce(
    (sum, s) => sum + s.durationMinutes + (s.bufferAfterMinutes ?? 0),
    0,
  )
}
