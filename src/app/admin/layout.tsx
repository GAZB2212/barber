import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { signOut } from '@/lib/admin/auth-actions'

/**
 * Never prerender anything under /admin.
 *
 * These pages are per-signed-in-user. Without this, a build that happens to
 * resolve a session at compile time bakes one shop's dashboard into static
 * HTML and serves it to everyone.
 */
export const dynamic = 'force-dynamic'

const NAV = [
  { href: '/admin', label: 'Diary' },
  { href: '/admin/time-off', label: 'Time off' },
  { href: '/admin/services', label: 'Services' },
  { href: '/admin/staff', label: 'Team' },
  { href: '/admin/hours', label: 'Hours' },
  { href: '/admin/settings', label: 'Settings' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  // The login screen renders inside this layout but has no session yet.
  if (!session) return <>{children}</>

  return (
    <div className="min-h-dvh">
      <header className="border-b border-edge">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="font-semibold">{session.shop.name}</p>
            <p className="text-xs text-muted">
              {session.name} · {session.role}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/${session.shop.slug}`}
              className="tap inline-flex items-center rounded-[var(--shop-radius)] border border-edge px-3 text-sm"
            >
              View site
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="tap inline-flex items-center rounded-[var(--shop-radius)] px-3 text-sm underline"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        {/* Horizontal scroll on narrow screens; the page still scrolls vertically. */}
        <nav aria-label="Dashboard" className="mx-auto max-w-5xl overflow-x-auto px-4">
          <ul className="flex gap-1 pb-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="tap inline-flex items-center whitespace-nowrap rounded-[var(--shop-radius)] px-3 text-sm hover:bg-surface"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {session.isDemo ? (
        <p className="border-b border-edge bg-surface px-4 py-2 text-center text-xs text-muted">
          Demo mode — signed in automatically as an owner. Bookings are in memory
          and configuration cannot be saved.
        </p>
      ) : null}

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
