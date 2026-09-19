import { notFound } from 'next/navigation'
import { getBarbers, getServices, getShopBySlug } from '@/lib/shop'
import { formatDuration, formatPrice } from '@/lib/types'
import { ButtonLink, Card } from '@/components/ui'

export default async function ShopHomePage(
  { params }: { params: Promise<{ shop: string }> },
) {
  const { shop: slug } = await params
  const shop = await getShopBySlug(slug)
  if (!shop) notFound()

  const [services, barbers] = await Promise.all([
    getServices(shop.id),
    getBarbers(shop.id),
  ])

  // Preserve the owner's display_order within each category.
  const categories = services.reduce<Map<string, typeof services>>((acc, service) => {
    const key = service.category ?? 'Services'
    const bucket = acc.get(key)
    if (bucket) bucket.push(service)
    else acc.set(key, [service])
    return acc
  }, new Map())

  return (
    <div className="mx-auto max-w-3xl px-4">
      <section className="py-10 sm:py-14">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{shop.name}</h1>
        {shop.tagline ? (
          <p className="mt-2 text-lg text-muted">{shop.tagline}</p>
        ) : null}
        {shop.about ? (
          <p className="mt-4 max-w-prose leading-relaxed">{shop.about}</p>
        ) : null}
        <div className="mt-6">
          <ButtonLink href={`/${shop.slug}/book`}>Book an appointment</ButtonLink>
        </div>
      </section>

      <section aria-labelledby="services-heading" className="py-6">
        <h2 id="services-heading" className="text-xl font-semibold">Services</h2>
        {services.length === 0 ? (
          <p className="mt-3 text-muted">Services are being set up. Please call the shop.</p>
        ) : (
          <div className="mt-4 space-y-8">
            {[...categories].map(([category, items]) => (
              <div key={category}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {category}
                </h3>
                <ul className="mt-3 space-y-2">
                  {items.map((service) => (
                    <li key={service.id}>
                      <Card className="flex items-baseline justify-between gap-4 p-4">
                        <div className="min-w-0">
                          <p className="font-medium">{service.name}</p>
                          {service.description ? (
                            <p className="mt-0.5 text-sm text-muted">{service.description}</p>
                          ) : null}
                          <p className="mt-1 text-sm text-muted">
                            {formatDuration(service.durationMinutes)}
                          </p>
                        </div>
                        <p className="shrink-0 font-semibold tabular-nums">
                          {formatPrice(service.pricePence)}
                        </p>
                      </Card>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {barbers.length > 0 ? (
        <section aria-labelledby="team-heading" className="py-6">
          <h2 id="team-heading" className="text-xl font-semibold">The team</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {barbers.map((barber) => (
              <li key={barber.id}>
                <Card className="flex items-center gap-3 p-4">
                  {barber.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={barber.avatarUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand font-semibold text-on-brand"
                    >
                      {barber.name.charAt(0)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium">{barber.name}</p>
                    {barber.bio ? (
                      <p className="text-sm text-muted">{barber.bio}</p>
                    ) : null}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
