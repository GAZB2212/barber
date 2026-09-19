import { NextResponse, type NextRequest } from 'next/server'
import { DEMO_SESSION_COOKIE } from '@/lib/demo-session'

/**
 * Gives each visitor an id that scopes their demo bookings, so two people
 * trying the demo at the same time do not collide.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  if (!request.cookies.get(DEMO_SESSION_COOKIE)) {
    response.cookies.set(DEMO_SESSION_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    })
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
