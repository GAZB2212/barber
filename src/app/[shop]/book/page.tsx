import { notFound } from 'next/navigation'
import { getBarbers, getServices, getShopBySlug } from '@/lib/shop'
import { BookingFlow } from './booking-flow'

export default async function BookPage(
  { params }: { params: Promise<{ shop: string }> },
) {
  const { shop: slug } = await params
  const shop = await getShopBySlug(slug)
  if (!shop) notFound()

  const [services, barbers] = await Promise.all([
    getServices(shop.id),
    getBarbers(shop.id),
  ])

  return <BookingFlow shop={shop} services={services} barbers={barbers} />
}
