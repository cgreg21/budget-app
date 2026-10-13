import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from 'budget-lib'
import {
  createTempUserDataDir,
  readJson,
  removeTempUserDataDir,
  writeJson,
  type TempDataDir,
} from '../helpers/temp-data-dir.js'

type PathsModule = typeof import('../../src/data/paths.js')
type SettingsModule = typeof import('../../src/data/general-settings-store.js')

let temp: TempDataDir
let paths: PathsModule
let GeneralSettingsStore: SettingsModule['GeneralSettingsStore']
const opened: { dispose(): void }[] = []

function track<T extends { dispose(): void }>(store: T): T {
  opened.push(store)
  return store
}

const custom: GeneralSettings = {
  language: 'fr',
  currency: 'CHF',
  dateFormat: 'dd-mm-yyyy',
  amountFormat: 'space-comma',
  theme: 'dark',
}

beforeEach(async () => {
  temp = createTempUserDataDir()
  paths = (await import('../../src/data/paths.js')) as PathsModule
  ;({ GeneralSettingsStore } = (await import('../../src/data/general-settings-store.js')) as SettingsModule)
})

afterEach(() => {
  for (const store of opened.splice(0)) store.dispose()
  removeTempUserDataDir(temp)
})

describe('GeneralSettingsStore', () => {
  it('starts from the defaults', () => {
    expect(track(new GeneralSettingsStore()).settings).toEqual(DEFAULT_GENERAL_SETTINGS)
  })

  it('reads stored settings', () => {
    writeJson(paths.GENERAL_SETTINGS_FILE, custom)

    expect(track(new GeneralSettingsStore()).settings).toEqual(custom)
  })

  it('falls back to the defaults when a field holds an unknown value', () => {
    writeJson(paths.GENERAL_SETTINGS_FILE, { ...custom, theme: 'sepia' })

    expect(track(new GeneralSettingsStore()).settings).toEqual(DEFAULT_GENERAL_SETTINGS)
  })

  it('falls back to the defaults when the file is not an object', () => {
    writeJson(paths.GENERAL_SETTINGS_FILE, 'nope')

    expect(track(new GeneralSettingsStore()).settings).toEqual(DEFAULT_GENERAL_SETTINGS)
  })

  it('saves the settings to disk', () => {
    const store = track(new GeneralSettingsStore())

    store.save(custom)

    expect(store.settings).toEqual(custom)
    expect(readJson(paths.GENERAL_SETTINGS_FILE)).toEqual(custom)
  })
})
