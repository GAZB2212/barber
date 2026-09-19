import 'server-only'
import { cookies } from 'next/headers'

/** Cookie holding an opaque id that scopes one visitor's demo bookings. */
export const DEMO_SESSION_COOKIE = 'demo_session'

/**
 * The current visitor's demo session.
 *
 * Middleware sets the cookie on first request, so by the time any render or
 * action runs it exists. The fallback keeps the demo usable if a visitor
 * blocks cookies -- they simply share the anonymous sandbox.
 */
export async function getDemoSessionId(): Promise<string> {
  const store = await cookies()
  return store.get(DEMO_SESSION_COOKIE)?.value ?? 'anonymous'
}
