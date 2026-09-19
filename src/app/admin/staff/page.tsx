import { requireSession, isManager } from '@/lib/auth'
import { getBarbers, getServices } from '@/lib/shop'
import { demoBarbers, demoServices } from '@/lib/demo'
import { StaffManager } from './staff-manager'

export default async function StaffPage() {
  const session = await requireSession()
  const [barbers, services] = await Promise.all([
    session.isDemo ? demoBarbers : getBarbers(session.shop.id),
    session.isDemo ? demoServices : getServices(session.shop.id),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold">Team</h1>
      <p className="mt-2 text-sm text-muted">
        Who works here and what they do. A barber only appears as an option for
        the services ticked against them.
      </p>

      {!isManager(session) ? (
        <p className="mt-4 text-sm text-muted">
          Only an owner or manager can change the team.
        </p>
      ) : null}

      <StaffManager
        barbers={barbers}
        services={services.map((s) => ({ id: s.id, name: s.name }))}
        canEdit={isManager(session)}
        isDemo={session.isDemo}
      />
    </div>
  )
}
