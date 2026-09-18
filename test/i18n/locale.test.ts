/*
 * Covers language detection: the `BUDGET_APP_LOCALE` override, the desktop's
 * own language list (stubbed in test/helpers/glib-stub.ts, driven by the
 * standard `LANG`/`LC_ALL`/`LANGUAGE` variables), and the English fallback.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, getLocale } from '../../src/i18n/locale.js'

const LOCALE_ENV_VARS = ['BUDGET_APP_LOCALE', 'LANGUAGE', 'LC_ALL', 'LC_MESSAGES', 'LANG'] as const

function withEnv(values: Partial<Record<typeof LOCALE_ENV_VARS[number], string>>, run: () => void): void {
  const previous = Object.fromEntries(LOCALE_ENV_VARS.map((name) => [name, process.env[name]]))

  for (const name of LOCALE_ENV_VARS) delete process.env[name]
  for (const [name, value] of Object.entries(values)) process.env[name] = value

  try {
    run()
  } finally {
    for (const name of LOCALE_ENV_VARS) {
      const value = previous[name]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

afterEach(() => {
  // vitest.config.ts sets this for the whole suite; restore it between tests.
  process.env.BUDGET_APP_LOCALE = 'fr'
})

describe('getLocale', () => {
  it('honours the BUDGET_APP_LOCALE override above everything else', () => {
    withEnv({ BUDGET_APP_LOCALE: 'en', LANG: 'fr_FR.UTF-8' }, () => {
      expect(getLocale()).toBe('en')
    })
  })

  it('ignores an override that is not a supported locale', () => {
    withEnv({ BUDGET_APP_LOCALE: 'de', LANG: 'fr_FR.UTF-8' }, () => {
      expect(getLocale()).toBe('fr')
    })
  })

  it('falls back to the desktop language when there is no override', () => {
    withEnv({ LANG: 'fr_FR.UTF-8' }, () => {
      expect(getLocale()).toBe('fr')
    })
  })

  it('reads a bare language code with no territory', () => {
    withEnv({ LANG: 'en' }, () => {
      expect(getLocale()).toBe('en')
    })
  })

  it('falls back to English when the desktop language is not supported', () => {
    withEnv({ LANG: 'de_DE.UTF-8' }, () => {
      expect(getLocale()).toBe(DEFAULT_LOCALE)
    })
  })

  it('falls back to English when nothing is set at all', () => {
    withEnv({}, () => {
      expect(getLocale()).toBe(DEFAULT_LOCALE)
    })
  })
})
