/*
 * `setLocale()` pins the language for the rest of the session, above the
 * environment override. It is module state, so it lives in its own file to
 * keep the detection tests in locale.test.ts unaffected.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { getLocale, setLocale } from '../../src/i18n/locale.js'

afterEach(() => {
  process.env.BUDGET_APP_LOCALE = 'fr'
})

describe('setLocale', () => {
  it('takes precedence over the environment override', () => {
    process.env.BUDGET_APP_LOCALE = 'fr'
    expect(getLocale()).toBe('fr')

    setLocale('en')

    expect(getLocale()).toBe('en')
    process.env.BUDGET_APP_LOCALE = 'en'
    setLocale('fr')
    expect(getLocale()).toBe('fr')
  })
})
