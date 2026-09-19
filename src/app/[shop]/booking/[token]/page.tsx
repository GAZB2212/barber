import { notFound } from 'next/navigation'
import { getShopBySlug } from '@/lib/shop'
import { getAdminClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { demoBarbers, getDemoBooking } from '@/lib/demo'
import { getDemoSessionId } from '@/lib/demo-session'
import { ManageBooking } from './manage-booking'

type Props = { params: Promise<{ shop: string; token: string }> }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ManageBookingPage({ params }: Props) {
  const { shop: slug, token } = await params
  const shop = await getShopBySlug(slug)
  if (!shop || !UUID_RE.test(token)) notFound()

  if (!isSupabaseConfigured()) {
    const booking = getDemoBooking(await getDemoSessionId(), token)
    if (!booking) notFound()
    return (
      <ManageBooking
        shopSlug={shop.slug}
        shopName={shop.name}
        shopPhone={shop.phone}
        timezone={shop.timezone}
        cancellationHours={shop.cancellationHours}
        token={token}
        startsAt={booking.startsAt.toISOString()}
        status={booking.status}
        barberName={demoBarbers.find((b) => b.id === booking.barberId)?.name ?? ''}
        services={booking.services.map((s) => ({
          name: s.name, price_pence: s.pricePence,
        }))}
      />
    )
  }

  // The token is the credential; it is unguessable and scoped to one booking.
  const admin = getAdminClient()
  const { data } = await admin
    .from('appointments')
    .select(
      `id, starts_at, status, staff_id, shop_id, staff (name), appointment_services (name, price_pence, position)`,
    )
    .eq('manage_token', token)
    .eq('shop_id', shop.id)
    .maybeSingle()

  if (!data) notFound()

  const staff = data.staff as unknown as { name: string } | null
  const lines = (data.appointment_services ?? []) as unknown as
    { name: string; price_pence: number; position: number }[]

  return (
    <ManageBooking
      shopSlug={shop.slug}
      shopName={shop.name}
      shopPhone={shop.phone}
      timezone={shop.timezone}
      cancellationHours={shop.cancellationHours}
      token={token}
      startsAt={data.starts_at}
      status={data.status}
      barberName={staff?.name ?? ''}
      services={[...lines].sort((a, b) => a.position - b.position)}
    />
  )
}
