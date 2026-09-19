import { requireSession, isManager } from '@/lib/auth'
import { getOpeningHours } from '@/lib/admin/queries'
import { getBarbers } from '@/lib/shop'
import { demoBarbers } from '@/lib/demo'
import { HoursEditor } from './hours-editor'

export default async function HoursPage({
  searchParams,
}: {
  searchParams: Promise<{ who?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams

  const [hours, barbers] = await Promise.all([
    getOpeningHours(session),
    session.isDemo ? demoBarbers : getBarbers(session.shop.id),
  ])

  const who = params.who && params.who !== 'shop' ? params.who : 'shop'

  return (
    <div>
      <h1 className="text-2xl font-bold">Opening hours</h1>
      <p className="mt-2 text-sm text-muted">
        The shop week is the default. Give a barber their own hours and those
        replace the shop&rsquo;s for the days you set. Add two rows for one day
        to build in a lunch break.
      </p>

      <HoursEditor
        who={who}
        windows={hours[who] ?? []}
        barbers={barbers.map((b) => ({ id: b.id, name: b.name }))}
        canEdit={isManager(session)}
        isDemo={session.isDemo}
      />
    </div>
  )
}
