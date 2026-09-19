export type Shop = {
  id: string
  slug: string
  name: string
  tagline: string | null
  about: string | null
  phone: string | null
  email: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  postcode: string | null
  timezone: string
  slotIntervalMinutes: number
  leadTimeMinutes: number
  horizonDays: number
  cancellationHours: number
  maxServicesPerBooking: number
  logoUrl: string | null
  theme: unknown
}

export type Service = {
  id: string
  name: string
  description: string | null
  category: string | null
  durationMinutes: number
  pricePence: number
  bufferAfterMinutes: number
}

export type Barber = {
  id: string
  name: string
  bio: string | null
  avatarUrl: string | null
  acceptsBookings: boolean
  /** Service ids this barber performs, with any per-barber overrides. */
  serviceIds: string[]
  overrides: Record<string, { durationMinutes?: number; pricePence?: number }>
}

/** A service as it applies to one barber, overrides already resolved. */
export type ResolvedService = Service & { barberId: string }

export function resolveService(service: Service, barber: Barber): ResolvedService {
  const override = barber.overrides[service.id] ?? {}
  return {
    ...service,
    durationMinutes: override.durationMinutes ?? service.durationMinutes,
    pricePence: override.pricePence ?? service.pricePence,
    barberId: barber.id,
  }
}

export function formatPrice(pence: number): string {
  if (pence === 0) return 'Free'
  return pence % 100 === 0
    ? `£${pence / 100}`
    : `£${(pence / 100).toFixed(2)}`
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
}
