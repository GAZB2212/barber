import Link from 'next/link'

/**
 * Shared primitives.
 *
 * Every control carries `tap` (a 44px minimum height) because the whole point
 * of this app is that it works with a thumb, on a phone, in a barber's chair.
 */

const base =
  'tap inline-flex items-center justify-center gap-2 rounded-[var(--shop-radius)]' +
  ' px-5 text-base font-semibold transition-opacity disabled:opacity-50' +
  ' disabled:cursor-not-allowed'

const variants = {
  primary: 'bg-brand text-on-brand hover:opacity-90',
  secondary: 'border border-edge bg-surface text-ink hover:opacity-80',
  ghost: 'text-ink underline underline-offset-4 px-0',
} as const

type Variant = keyof typeof variants

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={`${base} ${variants[variant]} ${className}`} />
}

export function ButtonLink({
  variant = 'primary',
  className = '',
  href,
  children,
}: {
  variant?: Variant
  className?: string
  href: string
  children: React.ReactNode
}) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  )
}

export function Card({ children, className = '' }: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-[var(--shop-radius)] border border-edge bg-surface ${className}`}>
      {children}
    </div>
  )
}

const controlClass =
  'tap w-full rounded-[var(--shop-radius)] border border-edge bg-[var(--shop-bg)]' +
  ' px-3 text-base outline-none focus:border-[var(--shop-primary)]'

type FieldProps = {
  id: string
  label: string
  hint?: string
  error?: string
}

/**
 * Hints and errors are wired through `aria-describedby` rather than nested
 * inside the <label>. Nesting them folds the hint into the control's
 * accessible name, so "Mobile" and "Email" both end up announced as
 * "...if you gave an email" -- ambiguous to a screen reader and to any test
 * that selects a field by its label.
 */
function describedBy({ id, hint, error }: FieldProps): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
}

function FieldFrame({ id, label, hint, error, children }: FieldProps & {
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      {children}
      {hint ? (
        <span id={`${id}-hint`} className="block text-xs text-muted">{hint}</span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} role="alert" className="block text-xs font-medium text-red-600">
          {error}
        </span>
      ) : null}
    </div>
  )
}

export function TextField({
  id, label, hint, error, ...props
}: FieldProps & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <input
        {...props}
        id={id}
        name={props.name ?? id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy({ id, label, hint, error })}
        className={controlClass}
      />
    </FieldFrame>
  )
}

export function TextArea({
  id, label, hint, error, ...props
}: FieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <textarea
        {...props}
        id={id}
        name={props.name ?? id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy({ id, label, hint, error })}
        className={`${controlClass} py-2`}
      />
    </FieldFrame>
  )
}

