/*
 * domain/preferences.ts — the bits of interface state the app remembers from
 * one run to the next.
 *
 * Nothing here changes the budget: these are display choices only, so an
 * invalid or missing file simply falls back to the defaults.
 */

export interface Preferences {
  /** Whether the charts accordion is open. */
  chartsExpanded: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  chartsExpanded: true,
}

export function isPreferences(value: unknown): value is Preferences {
  if (typeof value !== 'object' || value === null) return false
  return typeof (value as Partial<Preferences>).chartsExpanded === 'boolean'
}
