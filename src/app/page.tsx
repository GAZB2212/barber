import Link from 'next/link'
import { DEMO_SLUG } from '@/lib/demo'

const promises = [
  {
    title: 'Nothing traps your scroll',
    body: 'The service list is a page, not a modal. No fixed heights, no locked body, no dead ends on a phone.',
  },
  {
    title: 'No account needed',
    body: 'A name and a way to reach you is enough. Nobody is forced to register, or to re-register when a login silently expires.',
  },
  {
    title: 'Double-booking is impossible',
    body: 'Not "unlikely" — the database itself refuses to place two appointments in one barber’s chair.',
  },
  {
    title: 'Your brand, not ours',
    body: 'Colours, logo, type and copy are per shop. The booking page looks like the shop, not like software.',
  },
]

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-3xl px-4">
      <section className="py-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">Chairtime</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          Booking software barbers can actually use.
        </h1>
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
          A white-label booking site for a barbershop: fast on a phone,
          honest about availability, and built by someone who has tried to book
          a haircut on the alternatives.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/${DEMO_SLUG}`}
            className="tap inline-flex items-center rounded-[var(--shop-radius)] bg-brand px-5 font-semibold text-on-brand"
          >
            Try the demo shop
          </Link>
          <Link
            href={`/${DEMO_SLUG}/book`}
            className="tap inline-flex items-center rounded-[var(--shop-radius)] border border-edge px-5 font-semibold"
          >
            Go straight to booking
          </Link>
        </div>
      </section>

      <section className="border-t border-edge py-12">
        <h2 className="text-xl font-semibold">What is different</h2>
        <dl className="mt-6 grid gap-6 sm:grid-cols-2">
          {promises.map((promise) => (
            <div key={promise.title}>
              <dt className="font-semibold">{promise.title}</dt>
              <dd className="mt-1 text-muted">{promise.body}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
