import { requireSession, isManager } from '@/lib/auth'
import { parseTheme } from '@/lib/theme'
import { SettingsForm } from './settings-form'

export default async function SettingsPage() {
  const session = await requireSession()

  return (
    <div>
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-2 text-sm text-muted">
        Your shop details, booking rules and branding. Changes show on the
        public site straight away.
      </p>

      {!isManager(session) ? (
        <p className="mt-4 text-sm text-muted">
          Only an owner or manager can change settings.
        </p>
      ) : null}

      <SettingsForm
        shop={session.shop}
        theme={parseTheme(session.shop.theme)}
        canEdit={isManager(session)}
        isDemo={session.isDemo}
      />
    </div>
  )
}
