import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { APP_VERSION } from '../src/app/app-info.js'

describe('app version', () => {
  it('matches the version in package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(APP_VERSION).toBe(pkg.version)
  })
})
