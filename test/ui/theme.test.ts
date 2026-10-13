/*
 * Covers the mapping from the saved theme to the Adwaita colour scheme. The
 * `gi:Adw-1` namespace is stubbed (see test/helpers/adw-stub.ts).
 */
import { describe, expect, it } from 'vitest'

import { ColorScheme, appliedColorScheme } from '../helpers/adw-stub.js'
import { applyTheme } from '../../src/ui/theme.js'

describe('applyTheme', () => {
  it('forces the light scheme', () => {
    applyTheme('light')
    expect(appliedColorScheme()).toBe(ColorScheme.FORCE_LIGHT)
  })

  it('forces the dark scheme', () => {
    applyTheme('dark')
    expect(appliedColorScheme()).toBe(ColorScheme.FORCE_DARK)
  })

  it('follows the system otherwise', () => {
    applyTheme('dark')
    applyTheme('system')
    expect(appliedColorScheme()).toBe(ColorScheme.DEFAULT)
  })
})
