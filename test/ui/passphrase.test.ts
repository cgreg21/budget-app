import { describe, expect, it } from 'vitest'

import { checkPassphrase, MIN_PASSPHRASE_LENGTH } from '../../src/ui/passphrase.js'

describe('checkPassphrase', () => {
  it('matches the shortest passphrase the library accepts', () => {
    expect(checkPassphrase('x'.repeat(MIN_PASSPHRASE_LENGTH), 'x'.repeat(MIN_PASSPHRASE_LENGTH))).toBe('ok')
    expect(checkPassphrase('x'.repeat(MIN_PASSPHRASE_LENGTH - 1), 'x'.repeat(MIN_PASSPHRASE_LENGTH - 1))).toBe('too-short')
  })

  it('reports a short passphrase before a mismatch when creating a file', () => {
    expect(checkPassphrase('', '')).toBe('too-short')
    expect(checkPassphrase('short', 'different')).toBe('too-short')
    expect(checkPassphrase('long enough', 'long enough?')).toBe('mismatch')
    expect(checkPassphrase('long enough', 'long enough')).toBe('ok')
  })

  it('only refuses an empty entry when opening a file', () => {
    expect(checkPassphrase('')).toBe('too-short')
    expect(checkPassphrase('a')).toBe('ok')
    expect(checkPassphrase('whatever was chosen')).toBe('ok')
  })
})
