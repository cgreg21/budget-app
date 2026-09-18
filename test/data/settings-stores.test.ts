import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_BALANCE_THRESHOLDS } from '../../src/domain/balance.js'
import {
  createTempUserDataDir,
  readJson,
  removeTempUserDataDir,
  writeJson,
  type TempDataDir,
} from '../helpers/temp-data-dir.js'

type PathsModule = typeof import('../../src/data/paths.js')
type ThresholdsModule = typeof import('../../src/data/thresholds-store.js')

let temp: TempDataDir
let paths: PathsModule
let ThresholdsStore: ThresholdsModule['ThresholdsStore']
const opened: { dispose(): void }[] = []

function track<T extends { dispose(): void }>(store: T): T {
  opened.push(store)
  return store
}

beforeEach(async () => {
  temp = createTempUserDataDir()
  paths = (await import('../../src/data/paths.js')) as PathsModule
  ;({ ThresholdsStore } = (await import('../../src/data/thresholds-store.js')) as ThresholdsModule)
})

afterEach(() => {
  for (const store of opened.splice(0)) store.dispose()
  removeTempUserDataDir(temp)
})

describe('ThresholdsStore', () => {
  it('starts from the defaults', () => {
    expect(track(new ThresholdsStore()).thresholds).toEqual(DEFAULT_BALANCE_THRESHOLDS)
  })

  it('reads stored thresholds, dropping unknown fields', () => {
    writeJson(paths.THRESHOLDS_FILE, { low: -100, medium: 200, high: 900, extra: 'x' })

    expect(track(new ThresholdsStore()).thresholds).toEqual({ low: -100, medium: 200, high: 900 })
  })

  it('falls back to the defaults when the file breaks the ordering rule', () => {
    writeJson(paths.THRESHOLDS_FILE, { low: 1000, medium: 500, high: 0 })

    expect(track(new ThresholdsStore()).thresholds).toEqual(DEFAULT_BALANCE_THRESHOLDS)
  })

  it('falls back to the defaults when the file is not an object', () => {
    writeJson(paths.THRESHOLDS_FILE, 'nope')

    expect(track(new ThresholdsStore()).thresholds).toEqual(DEFAULT_BALANCE_THRESHOLDS)
  })

  it('saves ordered thresholds', () => {
    const store = track(new ThresholdsStore())

    expect(store.save({ low: -50, medium: 150, high: 800 })).toBe(true)
    expect(store.thresholds).toEqual({ low: -50, medium: 150, high: 800 })
    expect(readJson(paths.THRESHOLDS_FILE)).toEqual({ low: -50, medium: 150, high: 800 })
  })

  it('refuses thresholds that are out of order', () => {
    const store = track(new ThresholdsStore())

    expect(store.save({ low: 900, medium: 200, high: 100 })).toBe(false)
    expect(store.thresholds).toEqual(DEFAULT_BALANCE_THRESHOLDS)
  })
})
