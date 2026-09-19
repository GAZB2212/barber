'use client'

import { useState, useTransition } from 'react'
import { saveStaff } from '@/lib/admin/config-actions'
import type { Barber } from '@/lib/types'
import { Button, Card, TextField } from '@/components/ui'

type Props = {
  barbers: Barber[]
  services: { id: string; name: string }[]
  canEdit: boolean
  isDemo: boolean
}

export function StaffManager({ barbers, services, canEdit, isDemo }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(formData: FormData, serviceIds: string[], id?: string) {
    setError(null)
    startTransition(async () => {
      const result = await saveStaff({
        id,
        name: String(formData.get('name') ?? ''),
        role: String(formData.get('role') ?? 'barber') as 'owner' | 'manager' | 'barber',
        bio: String(formData.get('bio') ?? ''),
        acceptsBookings: formData.get('acceptsBookings') === 'on',
        isActive: true,
        serviceIds,
      })
      if (result.ok) {
        setEditingId(null)
        setIsAdding(false)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="mt-6">
      {error ? (
        <p role="alert" className="mb-4 text-sm font-medium text-red-600">{error}</p>
      ) : null}

      {canEdit ? (
        isAdding ? (
          <Card className="mb-4 p-4">
            <h2 className="font-semibold">New team member</h2>
            <StaffForm
              services={services}
              onSubmit={(data, ids) => submit(data, ids)}
              onCancel={() => setIsAdding(false)}
              isPending={isPending}
              isDemo={isDemo}
            />
          </Card>
        ) : (
          <Button onClick={() => setIsAdding(true)} className="mb-4">Add someone</Button>
        )
      ) : null}

      <ul className="space-y-2">
        {barbers.map((barber) => (
          <li key={barber.id}>
            <Card className="p-4">
              {editingId === barber.id ? (
                <StaffForm
                  barber={barber}
                  services={services}
                  onSubmit={(data, ids) => submit(data, ids, barber.id)}
                  onCancel={() => setEditingId(null)}
                  isPending={isPending}
                  isDemo={isDemo}
                />
              ) : (
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{barber.name}</p>
                    {barber.bio ? (
                      <p className="text-sm text-muted">{barber.bio}</p>
                    ) : null}
                    <p className="text-sm text-muted">
                      {barber.serviceIds.length} service
                      {barber.serviceIds.length === 1 ? '' : 's'}
                      {barber.acceptsBookings ? '' : ' · not taking bookings'}
                    </p>
                  </div>
                  {canEdit ? (
                    <Button variant="ghost" className="text-sm"
                      onClick={() => setEditingId(barber.id)}>
                      Edit
                    </Button>
                  ) : null}
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StaffForm({
  barber, services, onSubmit, onCancel, isPending, isDemo,
}: {
  barber?: Barber
  services: { id: string; name: string }[]
  onSubmit: (formData: FormData, serviceIds: string[]) => void
  onCancel: () => void
  isPending: boolean
  isDemo: boolean
}) {
  const [serviceIds, setServiceIds] = useState<string[]>(barber?.serviceIds ?? [])
  const key = barber?.id ?? 'new'

  return (
    <form action={(data) => onSubmit(data, serviceIds)} className="space-y-4">
      <TextField id={`name-${key}`} name="name" label="Name"
        defaultValue={barber?.name} required />
      <TextField id={`bio-${key}`} name="bio" label="Short bio"
        defaultValue={barber?.bio ?? ''} hint="Shown on the booking page." />

      <div className="space-y-1.5">
        <label htmlFor={`role-${key}`} className="block text-sm font-medium">Role</label>
        <select
          id={`role-${key}`} name="role" defaultValue="barber"
          className="tap w-full rounded-[var(--shop-radius)] border border-edge bg-[var(--shop-bg)] px-3 text-base"
        >
          <option value="barber">Barber</option>
          <option value="manager">Manager</option>
          <option value="owner">Owner</option>
        </select>
        <span className="block text-xs text-muted">
          Managers and owners can change services, the team and settings.
        </span>
      </div>

      <label className="tap flex items-center gap-2">
        <input type="checkbox" name="acceptsBookings"
          defaultChecked={barber?.acceptsBookings ?? true} className="h-5 w-5" />
        <span className="text-sm font-medium">Taking online bookings</span>
      </label>

      <fieldset>
        <legend className="text-sm font-medium">Services they do</legend>
        <ul className="mt-2 flex flex-wrap gap-2">
          {services.map((service) => {
            const isOn = serviceIds.includes(service.id)
            return (
              <li key={service.id}>
                <button
                  type="button"
                  aria-pressed={isOn}
                  onClick={() =>
                    setServiceIds((current) =>
                      current.includes(service.id)
                        ? current.filter((id) => id !== service.id)
                        : [...current, service.id])}
                  className={[
                    'tap rounded-[var(--shop-radius)] border px-3 text-sm',
                    isOn ? 'border-[var(--shop-primary)] bg-brand text-on-brand' : 'border-edge',
                  ].join(' ')}
                >
                  {service.name}
                </button>
              </li>
            )
          })}
        </ul>
      </fieldset>

      {isDemo ? (
        <p className="text-sm text-muted">
          Demo mode: this will not save. Connect a database to make changes stick.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
