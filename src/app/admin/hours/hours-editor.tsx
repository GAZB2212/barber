'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { saveOpeningHours } from '@/lib/admin/config-actions'
import { WEEKDAYS } from '@/lib/constants'
import type { OpeningWindow } from '@/lib/availability'
import { Button, Card } from '@/components/ui'

type Props = {
  who: string
  windows: OpeningWindow[]
  barbers: { id: string; name: string }[]
  canEdit: boolean
  isDemo: boolean
}

export function HoursEditor({ who, windows, barbers, canEdit, isDemo }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<OpeningWindow[]>(
    [...windows].sort((a, b) =>
      a.weekday - b.weekday || a.opensAt.localeCompare(b.opensAt)),
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function update(index: number, patch: Partial<OpeningWindow>) {
    setSaved(false)
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveOpeningHours({
        staffId: who === 'shop' ? null : who,
        windows: rows,
      })
      if (result.ok) setSaved(true)
      else setError(result.error)
    })
  }

  return (
    <div className="mt-6">
      <nav aria-label="Whose hours" className="flex flex-wrap gap-1">
        {[{ id: 'shop', name: 'Whole shop' }, ...barbers].map((option) => (
          <button
            key={option.id}
            type="button"
            aria-current={who === option.id ? 'true' : undefined}
            onClick={() => router.push(`/admin/hours?who=${option.id}`)}
            className={[
              'tap rounded-[var(--shop-radius)] border px-3 text-sm',
              who === option.id
                ? 'border-[var(--shop-primary)] bg-brand text-on-brand'
                : 'border-edge',
            ].join(' ')}
          >
            {option.name}
          </button>
        ))}
      </nav>

      {who !== 'shop' && rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          No personal hours, so this barber follows the shop week.
        </p>
      ) : null}

      <ul className="mt-4 space-y-2">
        {rows.map((row, index) => (
          <li key={index}>
            <Card className="flex flex-wrap items-center gap-2 p-3">
              <select
                aria-label="Day"
                value={row.weekday}
                disabled={!canEdit}
                onChange={(event) => update(index, { weekday: Number(event.target.value) })}
                className="tap rounded-[var(--shop-radius)] border border-edge bg-[var(--shop-bg)] px-2 text-sm"
              >
                {WEEKDAYS.map((day, value) => (
                  <option key={day} value={value}>{day}</option>
                ))}
              </select>

              <input
                aria-label="Opens at" type="time" value={row.opensAt} disabled={!canEdit}
                onChange={(event) => update(index, { opensAt: event.target.value })}
                className="tap rounded-[var(--shop-radius)] border border-edge bg-[var(--shop-bg)] px-2 text-sm"
              />
              <span aria-hidden className="text-muted">to</span>
              <input
                aria-label="Closes at" type="time" value={row.closesAt} disabled={!canEdit}
                onChange={(event) => update(index, { closesAt: event.target.value })}
                className="tap rounded-[var(--shop-radius)] border border-edge bg-[var(--shop-bg)] px-2 text-sm"
              />

              {canEdit ? (
                <Button variant="ghost" className="ml-auto text-sm"
                  onClick={() => {
                    setSaved(false)
                    setRows((current) => current.filter((_, i) => i !== index))
                  }}>
                  Remove
                </Button>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>

      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => {
            setSaved(false)
            setRows((current) => [...current, { weekday: 1, opensAt: '09:00', closesAt: '17:00' }])
          }}>
            Add a row
          </Button>
          <Button onClick={save} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save hours'}
          </Button>
          {saved ? <span role="status" className="text-sm text-muted">Saved.</span> : null}
        </div>
      ) : null}

      {isDemo ? (
        <p className="mt-3 text-sm text-muted">
          Demo mode: hours will not save. Connect a database to make changes stick.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">{error}</p>
      ) : null}
    </div>
  )
}
