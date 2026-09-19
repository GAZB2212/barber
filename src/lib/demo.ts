import { TZDate } from '@date-fns/tz'
import type { Barber, Service, Shop } from '@/lib/types'
import { localDateOf, type Interval, type OpeningWindow } from '@/lib/availability'

/**
 * A self-contained demo shop.
 *
 * Used when Supabase is not configured, so the app runs — and can be shown to
 * a barber — straight after `npm install`, with no database, no keys and no
 * account. Everything here is in memory: bookings made against the demo shop
 * last until the server restarts.
 */

export const DEMO_SLUG = 'demo'

export const demoShop: Shop = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: DEMO_SLUG,
  name: 'Bardeen & Sons',
  tagline: 'Traditional barbering, booked in seconds',
  about:
    'A demo shop, so you can try the booking flow end to end. Every time slot, ' +
    'barber and price below is fake — but the booking logic is exactly what a ' +
    'real shop would run.',
  phone: '01244 000000',
  email: 'hello@example.com',
  addressLine1: '57 Bridge Street',
  addressLine2: null,
  city: 'Chester',
  postcode: 'CH1 1NW',
  timezone: 'Europe/London',
  slotIntervalMinutes: 15,
  leadTimeMinutes: 60,
  horizonDays: 60,
  cancellationHours: 24,
  maxServicesPerBooking: 4,
  logoUrl: null,
  theme: {
    primary: '#1c1917',
    onPrimary: '#fafaf9',
    background: '#ffffff',
    surface: '#f5f5f4',
    text: '#1c1917',
    muted: '#78716c',
    border: '#e7e5e4',
    radius: 12,
    font: 'sans',
  },
}

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const demoServices: Service[] = [
  { id: id(101), name: 'Skin fade', description: 'Taken down to the skin, blended out.', category: 'Cuts', durationMinutes: 45, pricePence: 2500, bufferAfterMinutes: 5 },
  { id: id(102), name: 'Classic cut', description: 'Scissor cut, washed and styled.', category: 'Cuts', durationMinutes: 30, pricePence: 1800, bufferAfterMinutes: 5 },
  { id: id(103), name: 'Restyle', description: 'A full change. Allow extra time.', category: 'Cuts', durationMinutes: 60, pricePence: 3200, bufferAfterMinutes: 5 },
  { id: id(104), name: 'Grade all over', description: 'One length, clippers only.', category: 'Cuts', durationMinutes: 15, pricePence: 1200, bufferAfterMinutes: 0 },
  { id: id(201), name: 'Hot towel shave', description: 'Cut-throat razor, hot towels, balm.', category: 'Shaving', durationMinutes: 45, pricePence: 3000, bufferAfterMinutes: 5 },
  { id: id(202), name: 'Beard trim', description: 'Shaped up and lined in.', category: 'Shaving', durationMinutes: 20, pricePence: 1200, bufferAfterMinutes: 0 },
  { id: id(203), name: 'Head shave', description: 'Razored smooth.', category: 'Shaving', durationMinutes: 30, pricePence: 2000, bufferAfterMinutes: 5 },
  { id: id(301), name: 'Kids cut (under 12)', description: null, category: 'Younger clients', durationMinutes: 20, pricePence: 1400, bufferAfterMinutes: 0 },
  { id: id(401), name: 'Grey blending', description: 'Softens the grey, keeps it natural.', category: 'Colour', durationMinutes: 40, pricePence: 2800, bufferAfterMinutes: 10 },
]

const allServiceIds = demoServices.map((s) => s.id)

export const demoBarbers: Barber[] = [
  {
    id: id(1001), name: 'Marcus', bio: 'Fades and classic cuts. 12 years in the chair.',
    avatarUrl: null, acceptsBookings: true, serviceIds: allServiceIds, overrides: {},
  },
  {
    id: id(1002), name: 'Dee', bio: 'Restyles, colour and beard work.',
    avatarUrl: null, acceptsBookings: true, serviceIds: allServiceIds,
    // Senior barber: quicker on a fade, dearer on a restyle.
    overrides: { [id(101)]: { durationMinutes: 35 }, [id(103)]: { pricePence: 3800 } },
  },
  {
    id: id(1003), name: 'Sal', bio: 'Traditional wet shaves.',
    avatarUrl: null, acceptsBookings: true,
    serviceIds: [id(102), id(104), id(201), id(202), id(203), id(301)], overrides: {},
  },
]

/** Tuesday to Saturday, with a Thursday late night for Dee. */
export const demoOpeningHours: Record<string, OpeningWindow[]> = {
  shop: [2, 3, 4, 5].flatMap((weekday) => [
    { weekday, opensAt: '09:00', closesAt: '13:00' },
    { weekday, opensAt: '14:00', closesAt: '18:00' },
  ]).concat([{ weekday: 6, opensAt: '08:30', closesAt: '16:00' }]),
  [id(1002)]: [
    { weekday: 4, opensAt: '12:00', closesAt: '20:00' },
    { weekday: 5, opensAt: '09:00', closesAt: '18:00' },
    { weekday: 6, opensAt: '08:30', closesAt: '16:00' },
  ],
}

/**
 * Bookings made in demo mode, kept in memory and partitioned per visitor.
 *
 * Deliberately not persisted, and deliberately not global: two people trying
 * the demo at once should not block each other’s slots, and a test run should
 * not inherit bookings from the last one. The key is an opaque session cookie
 * set by middleware.
 */
export type DemoBooking = {
  token: string
  barberId: string
  startsAt: Date
  endsAt: Date
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  name: string
  phone: string | null
  note: string | null
  services: { name: string; pricePence: number; durationMinutes: number }[]
}

/**
 * Held on `globalThis`, not in a module-level `const`.
 *
 * Next.js bundles Server Actions separately from Server Component rendering,
 * so a plain module-level Map is instantiated twice in production: an action
 * writes to one copy and the page reads the other, and every change silently
 * vanishes. It also survives hot reloads in development.
 */
export type DemoTimeOff = {
  id: string
  barberId: string
  start: Date
  end: Date
  reason: string | null
}

const store = ((globalThis as typeof globalThis & {
  __chairtimeDemo?: {
    sessions: Map<string, Map<string, DemoBooking>>
    timeOff: Map<string, DemoTimeOff[]>
  }
}).__chairtimeDemo ??= { sessions: new Map(), timeOff: new Map() })

const sessions = store.sessions

/** Cap live demo sessions so a long-running process cannot grow forever. */
const MAX_SESSIONS = 500

/**
 * Pre-filled appointments, so a barber opening the diary sees a realistic day
 * rather than an empty grid. Generated relative to today and keyed by session
 * so they stay stable for one visitor.
 */
/**
 * An instant at `hour` o'clock, `dayOffset` days from today, in the demo
 * shop's timezone.
 *
 * `Date#setHours` would use the *server's* timezone, which on a UTC host puts
 * every seeded appointment an hour out for a London shop in summer.
 */
function shopLocal(dayOffset: number, hour: number): Date {
  const today = localDateOf(new Date(), demoShop.timezone)
  const [year, month, day] = today.split('-').map(Number)
  return new Date(
    new TZDate(year, month - 1, day + dayOffset, hour, 0, 0, 0, demoShop.timezone).getTime(),
  )
}

function seedFor(sessionId: string): DemoBooking[] {
  // Long enough not to repeat a name within a day's seeded appointments.
  const names = [
    'Tom Whelan', 'Ryan P.', 'Danny Okoro', 'Alex Reid', 'Sam Curtis',
    'Joe Mannion', 'Chris Bale', 'Mo Farah-Jones', 'Nathan Hurst', 'Leo Sant',
    'Kieran Duff', 'Owen Pryce', 'Jamal Rees', 'Stu Hargreaves', 'Ben Nowak',
    'Callum Ford', 'Dev Anand', 'Pete Salisbury', 'Ash Whitmore', 'Rob Deane',
  ]
  const cuts = [
    { name: 'Skin fade', pricePence: 2500, durationMinutes: 45 },
    { name: 'Classic cut', pricePence: 1800, durationMinutes: 30 },
    { name: 'Beard trim', pricePence: 1200, durationMinutes: 20 },
  ]
  const seeded: DemoBooking[] = []
  let n = 0
  for (const [index, barber] of demoBarbers.entries()) {
    const offsets = index === 0 ? [0, 1, 2, 4] : index === 1 ? [0, 1, 3] : [0, 2]
    for (const dayOffset of offsets) {
      for (const hour of [10, 15]) {
        const start = shopLocal(dayOffset, hour)
        const cut = cuts[n % cuts.length]
        seeded.push({
          token: `seed-${sessionId}-${barber.id}-${dayOffset}-${hour}`,
          barberId: barber.id,
          startsAt: start,
          endsAt: new Date(start.getTime() + 45 * 60_000),
          status: 'confirmed',
          name: names[n % names.length],
          phone: null,
          note: null,
          services: [cut],
        })
        n += 1
      }
    }
  }
  return seeded
}

function bookingsFor(sessionId: string): Map<string, DemoBooking> {
  let bookings = sessions.get(sessionId)
  if (!bookings) {
    if (sessions.size >= MAX_SESSIONS) {
      // Map preserves insertion order, so this drops the oldest session.
      const oldest = sessions.keys().next().value
      if (oldest) sessions.delete(oldest)
    }
    bookings = new Map(seedFor(sessionId).map((booking) => [booking.token, booking]))
    sessions.set(sessionId, bookings)
  }
  return bookings
}

/** Every appointment for a session, seeded and booked alike. */
export function demoAppointments(sessionId: string): DemoBooking[] {
  return [...bookingsFor(sessionId).values()]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

/** Barber absences booked from the dashboard. */
export function demoTimeOff(sessionId: string): DemoTimeOff[] {
  return store.timeOff.get(sessionId) ?? []
}

export function addDemoTimeOff(
  sessionId: string,
  entry: { barberId: string; start: Date; end: Date; reason: string | null },
) {
  const list = store.timeOff.get(sessionId) ?? []
  list.push({ ...entry, id: crypto.randomUUID() })
  store.timeOff.set(sessionId, list)
}

export function removeDemoTimeOff(sessionId: string, id: string) {
  store.timeOff.set(sessionId, demoTimeOff(sessionId).filter((entry) => entry.id !== id))
}

export function demoBusyFor(sessionId: string, barberId: string): Interval[] {
  const booked = bookingsFor(sessionId)
  const live = [...booked.values()]
    .filter((b) => b.barberId === barberId && (b.status === 'confirmed' || b.status === 'completed'))
    .map((b) => ({ start: b.startsAt, end: b.endsAt }))

  const absences = demoTimeOff(sessionId)
    .filter((entry) => entry.barberId === barberId)
    .map((entry) => ({ start: entry.start, end: entry.end }))

  return [...live, ...absences]
}

export function addDemoBooking(
  sessionId: string,
  booking: Omit<DemoBooking, 'status' | 'phone' | 'note'> &
    Partial<Pick<DemoBooking, 'phone' | 'note'>>,
): boolean {
  const bookings = bookingsFor(sessionId)
  // Mirror the database's exclusion constraint.
  const clash = [...bookings.values()].some(
    (existing) =>
      (existing.status === 'confirmed' || existing.status === 'completed') &&
      existing.barberId === booking.barberId &&
      existing.startsAt < booking.endsAt &&
      existing.endsAt > booking.startsAt,
  )
  if (clash) return false
  bookings.set(booking.token, {
    phone: null, note: null, ...booking, status: 'confirmed',
  })
  return true
}

export const getDemoBooking = (sessionId: string, token: string) =>
  bookingsFor(sessionId).get(token)

export function setDemoBookingStatus(
  sessionId: string,
  token: string,
  status: DemoBooking['status'],
): boolean {
  const booking = bookingsFor(sessionId).get(token)
  if (!booking) return false
  booking.status = status
  return true
}

export const cancelDemoBooking = (sessionId: string, token: string) =>
  setDemoBookingStatus(sessionId, token, 'cancelled')
