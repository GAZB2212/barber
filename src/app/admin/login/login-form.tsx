'use client'

import { useActionState } from 'react'
import { signIn } from '@/lib/admin/auth-actions'
import { Button, TextField } from '@/components/ui'

export function LoginForm() {
  const [state, action, isPending] = useActionState(signIn, null)

  return (
    <form action={action} className="mt-8 space-y-4">
      <TextField id="email" label="Email" type="email" inputMode="email"
        autoComplete="email" required />
      <TextField id="password" label="Password" type="password"
        autoComplete="current-password" required />

      {state?.error ? (
        <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>
      ) : null}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
