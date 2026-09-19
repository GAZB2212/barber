import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

/**
 * Request-scoped client carrying the visitor's session. Subject to RLS, so a
 * signed-out visitor sees exactly what the public booking site should see.
 */
export async function getServerClient() {
  const cookieStore = await cookies()
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Session refresh happens in middleware instead.
        }
      },
    },
  })
}

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Used only where a request must write data that no signed-in user owns --
 * chiefly creating a booking for a customer with no account. Availability is
 * re-validated in `createBooking` before this client is ever reached.
 */
export function getAdminClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
