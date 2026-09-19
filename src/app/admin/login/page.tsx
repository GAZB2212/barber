import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { LoginForm } from './login-form'

export default async function LoginPage() {
  // Demo mode signs you in automatically, so there is nothing to log into.
  if (await getSession()) redirect('/admin')
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        For shop owners and barbers. Customers never need an account.
      </p>
      <LoginForm />
    </div>
  )
}
