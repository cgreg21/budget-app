/*
 * i18n/locale.ts — which language the app runs in.
 *
 * Detected from the desktop's own language list (`GLib.get_language_names()`,
 * e.g. `["fr_FR.UTF-8", "fr_FR", "fr.UTF-8", "fr", "C"]`), so the app follows
 * whatever the user already set for their session. `BUDGET_APP_LOCALE` (an
 * environment variable) overrides it — used by the tests, and available as an
 * escape hatch for anyone who wants the app in a language other than their
 * desktop's.
 */
import GLib from 'gi:GLib-2.0'

export type Locale = 'fr' | 'en'

export const DEFAULT_LOCALE: Locale = 'en'

const SUPPORTED_LOCALES: readonly Locale[] = ['fr', 'en']

const LOCALE_OVERRIDE_ENV = 'BUDGET_APP_LOCALE'
let configuredLocale: Locale | undefined

function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/** The language of a GLib locale name, e.g. `"fr_FR.UTF-8"` → `"fr"`. */
function languageOf(name: string): string {
  const separatorIndex = name.search(/[_.@]/)
  const language = separatorIndex === -1 ? name : name.slice(0, separatorIndex)
  return language.toLowerCase()
}

/** The first of the desktop's languages we have translations for. */
function detectSystemLocale(): Locale {
  const names = GLib.getLanguageNames()
  for (const name of names) {
    const language = languageOf(name)
    if (isLocale(language)) return language
  }
  return DEFAULT_LOCALE
}

/**
 * The language the app runs in. Not cached: `BUDGET_APP_LOCALE` may change
 * between test cases, and asking the desktop again is cheap.
 */
export function getLocale(): Locale {
  if (configuredLocale !== undefined) return configuredLocale
  const override = process.env[LOCALE_OVERRIDE_ENV]
  return override !== undefined && isLocale(override) ? override : detectSystemLocale()
}

/** Applies the saved language for the current application session. */
export function setLocale(locale: Locale): void {
  configuredLocale = locale
}
