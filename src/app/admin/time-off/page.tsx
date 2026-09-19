import { requireSession } from '@/lib/auth'
import { getTimeOff } from '@/lib/admin/queries'
import { getBarbers } from '@/lib/shop'
import { demoBarbers } from '@/lib/demo'
import { TimeOffManager } from './time-off-manager'

export default async function TimeOffPage() {
  const session = await requireSession()
  const [entries, barbers] = await Promise.all([
    getTimeOff(session),
    session.isDemo ? demoBarbers : getBarbers(session.shop.id),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold">Time off</h1>
      <p className="mt-2 text-sm text-muted">
        Block out holidays, appointments or an early finish. Blocked time
        disappears from the booking site immediately.
      </p>

      <TimeOffManager
        entries={entries}
        timezone={session.shop.timezone}
        currentStaffId={session.staffId}
        barbers={barbers.map((b) => ({ id: b.id, name: b.name }))}
      />
    </div>
  )
}
