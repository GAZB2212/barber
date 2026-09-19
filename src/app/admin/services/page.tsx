import { requireSession, isManager } from '@/lib/auth'
import { getServices } from '@/lib/shop'
import { demoServices } from '@/lib/demo'
import { ServicesManager } from './services-manager'

export default async function ServicesPage() {
  const session = await requireSession()
  const services = session.isDemo ? demoServices : await getServices(session.shop.id)

  return (
    <div>
      <h1 className="text-2xl font-bold">Services</h1>
      <p className="mt-2 text-sm text-muted">
        What you offer, how long it takes and what it costs. Duration drives the
        slots customers are shown, so keep it honest.
      </p>

      {!isManager(session) ? (
        <p className="mt-4 text-sm text-muted">
          Only an owner or manager can change services.
        </p>
      ) : null}

      <ServicesManager
        services={services}
        canEdit={isManager(session)}
        isDemo={session.isDemo}
      />
    </div>
  )
}
