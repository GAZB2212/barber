'use client'

import { useState, useTransition } from 'react'
import { saveSettings } from '@/lib/admin/config-actions'
import type { Theme } from '@/lib/theme'
import type { Shop } from '@/lib/types'
import { Button, Card, TextField } from '@/components/ui'

type Props = { shop: Shop; theme: Theme; canEdit: boolean; isDemo: boolean }

const COLOURS: { key: keyof Theme; label: string }[] = [
  { key: 'primary', label: 'Brand colour' },
  { key: 'onPrimary', label: 'Text on brand' },
  { key: 'background', label: 'Page background' },
  { key: 'surface', label: 'Cards' },
  { key: 'text', label: 'Body text' },
  { key: 'muted', label: 'Secondary text' },
  { key: 'border', label: 'Borders' },
]

export function SettingsForm({ shop, theme, canEdit, isDemo }: Props) {
  const [colours, setColours] = useState<Theme>(theme)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function submit(formData: FormData) {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveSettings({
        name: String(formData.get('name') ?? ''),
        tagline: String(formData.get('tagline') ?? ''),
        about: String(formData.get('about') ?? ''),
        phone: String(formData.get('phone') ?? ''),
        email: String(formData.get('email') ?? ''),
        addressLine1: String(formData.get('addressLine1') ?? ''),
        city: String(formData.get('city') ?? ''),
        postcode: String(formData.get('postcode') ?? ''),
        slotIntervalMinutes: Number(formData.get('slotInterval') ?? 15),
        leadTimeMinutes: Number(formData.get('leadTime') ?? 60),
        horizonDays: Number(formData.get('horizon') ?? 60),
        cancellationHours: Number(formData.get('cancellation') ?? 24),
        maxServicesPerBooking: Number(formData.get('maxServices') ?? 4),
        isPublished: formData.get('isPublished') === 'on',
        theme: colours,
      })
      if (result.ok) setSaved(true)
      else setError(result.error)
    })
  }

  return (
    <form action={submit} className="mt-6 space-y-8">
      <Card className="space-y-4 p-4">
        <h2 className="font-semibold">Shop</h2>
        <TextField id="name" label="Name" defaultValue={shop.name} required disabled={!canEdit} />
        <TextField id="tagline" label="Tagline" defaultValue={shop.tagline ?? ''} disabled={!canEdit} />
        <TextField id="about" label="About" defaultValue={shop.about ?? ''} disabled={!canEdit} />
        <TextField id="phone" label="Phone" type="tel" defaultValue={shop.phone ?? ''} disabled={!canEdit} />
        <TextField id="email" label="Email" type="email" defaultValue={shop.email ?? ''} disabled={!canEdit} />
        <TextField id="addressLine1" label="Address" defaultValue={shop.addressLine1 ?? ''} disabled={!canEdit} />
        <TextField id="city" label="Town or city" defaultValue={shop.city ?? ''} disabled={!canEdit} />
        <TextField id="postcode" label="Postcode" defaultValue={shop.postcode ?? ''} disabled={!canEdit} />
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-semibold">Booking rules</h2>
        <TextField id="slotInterval" label="Slot interval (minutes)" type="number"
          inputMode="numeric" min={5} max={60} defaultValue={shop.slotIntervalMinutes}
          disabled={!canEdit}
          hint="How far apart offered start times are." />
        <TextField id="leadTime" label="Minimum notice (minutes)" type="number"
          inputMode="numeric" min={0} defaultValue={shop.leadTimeMinutes}
          disabled={!canEdit}
          hint="How soon before an appointment a customer may still book it." />
        <TextField id="horizon" label="Book up to (days ahead)" type="number"
          inputMode="numeric" min={1} max={365} defaultValue={shop.horizonDays}
          disabled={!canEdit} />
        <TextField id="cancellation" label="Free cancellation up to (hours before)"
          type="number" inputMode="numeric" min={0} max={336}
          defaultValue={shop.cancellationHours} disabled={!canEdit} />
        <TextField id="maxServices" label="Most services in one booking" type="number"
          inputMode="numeric" min={1} max={10} defaultValue={shop.maxServicesPerBooking}
          disabled={!canEdit} />

        <label className="tap flex items-center gap-2">
          <input type="checkbox" name="isPublished" defaultChecked disabled={!canEdit}
            className="h-5 w-5" />
          <span className="text-sm font-medium">Booking site is live</span>
        </label>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-semibold">Branding</h2>
        <p className="text-sm text-muted">
          These colours drive the whole customer-facing site.
        </p>

        <ul className="space-y-2">
          {COLOURS.map(({ key, label }) => (
            <li key={key} className="flex items-center justify-between gap-3">
              <label htmlFor={`colour-${key}`} className="text-sm">{label}</label>
              <span className="flex items-center gap-2">
                <code className="text-xs tabular-nums text-muted">
                  {String(colours[key])}
                </code>
                <input
                  id={`colour-${key}`}
                  type="color"
                  disabled={!canEdit}
                  value={String(colours[key])}
                  onChange={(event) => {
                    setSaved(false)
                    setColours((current) => ({ ...current, [key]: event.target.value }))
                  }}
                  className="tap h-11 w-14 rounded border border-edge bg-transparent"
                />
              </span>
            </li>
          ))}
        </ul>

        <div
          className="rounded-[var(--shop-radius)] border p-4"
          style={{
            background: colours.background,
            color: colours.text,
            borderColor: colours.border,
          }}
        >
          <p className="text-sm font-semibold">Preview</p>
          <p className="mt-1 text-sm" style={{ color: colours.muted }}>
            This is how your booking page will read.
          </p>
          <span
            className="mt-3 inline-flex h-11 items-center rounded-[var(--shop-radius)] px-4 text-sm font-semibold"
            style={{ background: colours.primary, color: colours.onPrimary }}
          >
            Book now
          </span>
        </div>
      </Card>

      {isDemo ? (
        <p className="text-sm text-muted">
          Demo mode: settings will not save. Connect a database to make changes stick.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-red-600">{error}</p>
      ) : null}

      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving…' : 'Save settings'}
          </Button>
          {saved ? <span role="status" className="text-sm text-muted">Saved.</span> : null}
        </div>
      ) : null}
    </form>
  )
}
