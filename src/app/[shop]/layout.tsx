import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getShopBySlug } from '@/lib/shop'
import { parseTheme, themeToCssVars } from '@/lib/theme'

type Props = {
  children: React.ReactNode
  params: Promise<{ shop: string }>
}

export async function generateMetadata(
  { params }: { params: Promise<{ shop: string }> },
): Promise<Metadata> {
  const { shop: slug } = await params
  const shop = await getShopBySlug(slug)
  if (!shop) return { title: 'Shop not found' }
  return {
    title: `${shop.name}${shop.tagline ? ` — ${shop.tagline}` : ''}`,
    description: shop.about ?? `Book an appointment at ${shop.name}.`,
    openGraph: { title: shop.name, description: shop.about ?? undefined },
  }
}

export default async function ShopLayout({ children, params }: Props) {
  const { shop: slug } = await params
  const shop = await getShopBySlug(slug)
  if (!shop) notFound()

  const theme = parseTheme(shop.theme)

  return (
    <div
      style={themeToCssVars(theme) as React.CSSProperties}
      className="min-h-dvh bg-[var(--shop-bg)] text-[var(--shop-text)] font-shop"
    >
      <header className="border-b border-edge">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Link href={`/${shop.slug}`} className="tap flex items-center gap-3 font-semibold">
            {shop.logoUrl ? (
              // Tenant logos are arbitrary remote URLs, so a plain <img> avoids
              // needing every customer domain in next.config remotePatterns.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.logoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : null}
            <span className="text-lg">{shop.name}</span>
          </Link>
          <Link
            href={`/${shop.slug}/book`}
            className="tap inline-flex items-center rounded-[var(--shop-radius)] bg-brand px-4 text-sm font-semibold text-on-brand"
          >
            Book now
          </Link>
        </div>
      </header>

      <main>{children}</main>

      <footer className="mt-16 border-t border-edge">
        <div className="mx-auto max-w-3xl space-y-1 px-4 py-8 text-sm text-muted">
          {shop.addressLine1 ? (
            <p>
              {[shop.addressLine1, shop.addressLine2, shop.city, shop.postcode]
                .filter(Boolean)
                .join(', ')}
            </p>
          ) : null}
          {shop.phone ? (
            <p>
              {/* inline-flex + `tap` so a thumb can actually hit the number. */}
              <a
                className="tap inline-flex items-center underline"
                href={`tel:${shop.phone.replace(/\s+/g, '')}`}
              >
                {shop.phone}
              </a>
            </p>
          ) : null}
          <p className="pt-4 text-xs">
            © {new Date().getFullYear()} {shop.name}
          </p>
        </div>
      </footer>
    </div>
  )
}
