import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, isPreferences } from '../../src/domain/preferences.js'

describe('isPreferences', () => {
  it('accepts the defaults', () => {
    expect(isPreferences(DEFAULT_PREFERENCES)).toBe(true)
  })

  it('accepts a valid preferences object', () => {
    expect(isPreferences({ chartsExpanded: false })).toBe(true)
  })

  it('rejects non-objects', () => {
    expect(isPreferences(null)).toBe(false)
    expect(isPreferences('true')).toBe(false)
  })

  it('rejects a non-boolean chartsExpanded', () => {
    expect(isPreferences({ chartsExpanded: 'true' })).toBe(false)
  })

  it('rejects a missing chartsExpanded', () => {
    expect(isPreferences({})).toBe(false)
  })
})
