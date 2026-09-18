import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_BALANCE_THRESHOLDS } from '../../src/domain/balance.js'
import { DEFAULT_PREFERENCES } from '../../src/domain/preferences.js'
import {
  createTempUserDataDir,
  readJson,
  removeTempUserDataDir,
  writeJson,
  type TempDataDir,
} from '../helpers/temp-data-dir.js'

type PathsModule = typeof import('../../src/data/paths.js')
type ThresholdsModule = typeof import('../../src/data/thresholds-store.js')
type PreferencesModule = typeof import('../../src/data/preferences-store.js')

let temp: TempDataDir
let paths: PathsModule
let ThresholdsStore: ThresholdsModule['ThresholdsStore']
let PreferencesStore: PreferencesModule['PreferencesStore']
const opened: { dispose(): void }[] = []

function track<T extends { dispose(): void }>(store: T): T {
  opened.push(store)
  return store
}

beforeEach(async () => {
  temp = createTempUserDataDir()
  paths = (await import('../../src/data/paths.js')) as PathsModule
  ;({ ThresholdsStore } = (await import('../../src/data/thresholds-store.js')) as ThresholdsModule)
  ;({ PreferencesStore } = (await import('../../src/data/preferences-store.js')) as PreferencesModule)
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

describe('PreferencesStore', () => {
  it('starts from the defaults', () => {
    const store = track(new PreferencesStore())

    expect(store.preferences).toEqual(DEFAULT_PREFERENCES)
    expect(store.chartsExpanded).toBe(DEFAULT_PREFERENCES.chartsExpanded)
  })

  it('reads stored preferences, dropping unknown fields', () => {
    writeJson(paths.PREFERENCES_FILE, { chartsExpanded: false, extra: 'x' })

    expect(track(new PreferencesStore()).preferences).toEqual({ chartsExpanded: false })
  })

  it('falls back to the defaults when the file is invalid', () => {
    writeJson(paths.PREFERENCES_FILE, { chartsExpanded: 'oui' })

    expect(track(new PreferencesStore()).preferences).toEqual(DEFAULT_PREFERENCES)
  })

  it('persists a changed value', () => {
    const store = track(new PreferencesStore())
    store.setChartsExpanded(false)

    expect(store.chartsExpanded).toBe(false)
    expect(readJson(paths.PREFERENCES_FILE)).toEqual({ chartsExpanded: false })
  })

  it('does not write when the value is unchanged', () => {
    const store = track(new PreferencesStore())
    let notified = 0
    store.onChange(() => {
      notified += 1
    })

    store.setChartsExpanded(store.chartsExpanded)

    expect(notified).toBe(0)
  })

  it('notifies subscribers when the value actually changes', () => {
    const store = track(new PreferencesStore())
    let notified = 0
    store.onChange(() => {
      notified += 1
    })

    store.setChartsExpanded(!store.chartsExpanded)

    expect(notified).toBe(1)
  })
})
