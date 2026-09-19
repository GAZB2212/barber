'use client'

import { useState, useTransition } from 'react'
import { retireService, saveService } from '@/lib/admin/config-actions'
import { formatDuration, formatPrice, type Service } from '@/lib/types'
import { Button, Card, TextField } from '@/components/ui'

type Props = { services: Service[]; canEdit: boolean; isDemo: boolean }

export function ServicesManager({ services, canEdit, isDemo }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(formData: FormData, id?: string) {
    setError(null)
    startTransition(async () => {
      const result = await saveService({
        id,
        name: String(formData.get('name') ?? ''),
        description: String(formData.get('description') ?? ''),
        category: String(formData.get('category') ?? ''),
        // Prices are typed in pounds; the database stores pence.
        pricePence: Math.round(Number(formData.get('price') ?? 0) * 100),
        durationMinutes: Number(formData.get('duration') ?? 0),
        bufferAfterMinutes: Number(formData.get('buffer') ?? 0),
        isActive: true,
      })
      if (result.ok) {
        setEditingId(null)
        setIsAdding(false)
      } else {
        setError(result.error)
      }
    })
  }

  function retire(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await retireService(id)
      if (!result.ok) setError(result.error)
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
            <h2 className="font-semibold">New service</h2>
            <ServiceForm
              onSubmit={(data) => submit(data)}
              onCancel={() => setIsAdding(false)}
              isPending={isPending}
              isDemo={isDemo}
            />
          </Card>
        ) : (
          <Button onClick={() => setIsAdding(true)} className="mb-4">Add a service</Button>
        )
      ) : null}

      <ul className="space-y-2">
        {services.map((service) => (
          <li key={service.id}>
            <Card className="p-4">
              {editingId === service.id ? (
                <ServiceForm
                  service={service}
                  onSubmit={(data) => submit(data, service.id)}
                  onCancel={() => setEditingId(null)}
                  isPending={isPending}
                  isDemo={isDemo}
                />
              ) : (
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{service.name}</p>
                    {service.description ? (
                      <p className="text-sm text-muted">{service.description}</p>
                    ) : null}
                    <p className="text-sm text-muted">
                      {formatDuration(service.durationMinutes)}
                      {service.bufferAfterMinutes > 0
                        ? ` + ${service.bufferAfterMinutes} min tidy-up`
                        : ''}
                      {service.category ? ` · ${service.category}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-semibold tabular-nums">
                      {formatPrice(service.pricePence)}
                    </p>
                    {canEdit ? (
                      <>
                        <Button variant="ghost" className="text-sm"
                          onClick={() => setEditingId(service.id)}>
                          Edit
                        </Button>
                        <Button variant="ghost" className="text-sm" disabled={isPending}
                          onClick={() => retire(service.id)}>
                          Retire
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ServiceForm({
  service, onSubmit, onCancel, isPending, isDemo,
}: {
  service?: Service
  onSubmit: (formData: FormData) => void
  onCancel: () => void
  isPending: boolean
  isDemo: boolean
}) {
  return (
    <form action={onSubmit} className="space-y-4">
      <TextField id={`name-${service?.id ?? 'new'}`} name="name" label="Name"
        defaultValue={service?.name} required />
      <TextField id={`description-${service?.id ?? 'new'}`} name="description"
        label="Description" defaultValue={service?.description ?? ''} />
      <TextField id={`category-${service?.id ?? 'new'}`} name="category"
        label="Category" defaultValue={service?.category ?? ''}
        hint="Groups services on the booking page, e.g. Cuts." />
      <TextField id={`duration-${service?.id ?? 'new'}`} name="duration"
        label="Minutes in the chair" type="number" inputMode="numeric" min={5} max={480}
        defaultValue={service?.durationMinutes ?? 30} required />
      <TextField id={`buffer-${service?.id ?? 'new'}`} name="buffer"
        label="Tidy-up minutes after" type="number" inputMode="numeric" min={0} max={120}
        defaultValue={service?.bufferAfterMinutes ?? 0}
        hint="Blocked out but not shown to the customer." />
      <TextField id={`price-${service?.id ?? 'new'}`} name="price" label="Price (£)"
        type="number" inputMode="decimal" min={0} step="0.50"
        defaultValue={service ? (service.pricePence / 100).toFixed(2) : '0.00'} required />

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
