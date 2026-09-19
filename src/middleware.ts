import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { DEMO_SESSION_COOKIE } from '@/lib/demo-session'

/**
 * Two jobs on every request:
 *
 *  1. Give each visitor an id scoping their demo bookings, so two people
 *     trying the demo at once do not collide.
 *  2. Refresh the Supabase auth session. Server Components cannot write
 *     cookies, so without this a signed-in barber is quietly logged out when
 *     their access token expires -- exactly the complaint this project exists
 *     to avoid.
 *
 * Order matters: the demo cookie is written onto `request` *before* the
 * response is created, because `NextResponse.next({ request })` snapshots the
 * request headers at that moment. Mutating `request.cookies` afterwards would
 * not reach the render, and the first page view would be attributed to a
 * different demo session from every request after it.
 */
export async function middleware(request: NextRequest) {
  let demoSessionId: string | null = null
  if (!request.cookies.get(DEMO_SESSION_COOKIE)) {
    demoSessionId = crypto.randomUUID()
    request.cookies.set(DEMO_SESSION_COOKIE, demoSessionId)
  }

  const response = NextResponse.next({ request })

  if (demoSessionId) {
    response.cookies.set(DEMO_SESSION_COOKIE, demoSessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    })
    // Touching the user is what triggers the refresh.
    await supabase.auth.getUser()
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
