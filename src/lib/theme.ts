import { z } from 'zod'

/**
 * Per-shop white-labelling.
 *
 * Themes are stored as jsonb and authored by shop owners, so the shape is
 * validated and every field falls back to a sane default: a bad theme must
 * never render an unreadable or broken site.
 */

const hex = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)

export const themeSchema = z.object({
  /** Brand colour for buttons and highlights. */
  primary: hex.default('#1c1917'),
  /** Text drawn on top of `primary`. */
  onPrimary: hex.default('#fafaf9'),
  /** Page background. */
  background: hex.default('#ffffff'),
  /** Cards and raised surfaces. */
  surface: hex.default('#f5f5f4'),
  /** Body text. */
  text: hex.default('#1c1917'),
  /** Secondary text. */
  muted: hex.default('#78716c'),
  border: hex.default('#e7e5e4'),
  /** Corner rounding in pixels. */
  radius: z.number().int().min(0).max(32).default(12),
  /** A font stack, or one of the built-in keywords. */
  font: z.enum(['sans', 'serif', 'mono']).default('sans'),
})

export type Theme = z.infer<typeof themeSchema>

export const defaultTheme: Theme = themeSchema.parse({})

export function parseTheme(value: unknown): Theme {
  const result = themeSchema.safeParse(value ?? {})
  return result.success ? result.data : defaultTheme
}

const FONT_STACKS: Record<Theme['font'], string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}

/** CSS custom properties for a shop, applied on its layout element. */
export function themeToCssVars(theme: Theme): Record<string, string> {
  return {
    '--shop-primary': theme.primary,
    '--shop-on-primary': theme.onPrimary,
    '--shop-bg': theme.background,
    '--shop-surface': theme.surface,
    '--shop-text': theme.text,
    '--shop-muted': theme.muted,
    '--shop-border': theme.border,
    '--shop-radius': `${theme.radius}px`,
    '--shop-font': FONT_STACKS[theme.font],
  }
}
