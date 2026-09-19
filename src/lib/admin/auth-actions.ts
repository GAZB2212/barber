'use server'

import 'server-only'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'

const credentials = z.object({
  email: z.string().trim().email('That email address looks wrong'),
  password: z.string().min(1, 'Enter your password'),
})

export async function signIn(
  _previous: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  if (!isSupabaseConfigured()) {
    return { error: 'Sign-in needs a database. The demo signs you in automatically.' }
  }

  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await getServerClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  // Deliberately vague: distinguishing "no such account" from "wrong password"
  // tells an attacker which emails are registered.
  if (error) return { error: 'That email and password did not match.' }

  redirect('/admin')
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await getServerClient()
    await supabase.auth.signOut()
  }
  redirect('/admin/login')
}
