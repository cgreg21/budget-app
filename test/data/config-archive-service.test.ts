/*
 * Covers the encrypted configuration file: what is gathered, the round trip
 * through the real WebCrypto cipher, how every failure is worded, and how a
 * file is applied — secrets kept when the file has none, the bank left alone
 * when the file says nothing about it, refusals of the secure storage reported.
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ConfigFileError,
  DEFAULT_BALANCE_THRESHOLDS,
  DEFAULT_CALENDAR_CONFIG,
  DEFAULT_GENERAL_SETTINGS,
  defaultBankState,
  ENCRYPTED_CONFIG_FORMAT,
  webCryptoConfigCipher,
  type BankState,
  type CalendarConfig,
  type ConfigData,
} from 'budget-lib'
import {
  ConfigArchiveService,
  configFileErrorMessage,
  type ConfigArchiveDeps,
} from '../../src/data/config-archive-service.js'
import { fr } from '../../src/i18n/fr.js'
import { createTempUserDataDir, removeTempUserDataDir, writeText, type TempDataDir } from '../helpers/temp-data-dir.js'

const PASSPHRASE = 'correct horse battery'
const REDIRECT = 'http://localhost:8765/bank'
const PEM = '-----BEGIN PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----\n'
const CALENDAR: CalendarConfig = { enabled: true, calendarUrl: 'https://dav.test/cal', username: 'alice' }

const accountOf = (config: CalendarConfig) => `${config.calendarUrl.trim().replace(/\/+$/, '')}|${config.username.trim()}`

interface Harness {
  service: ConfigArchiveService
  deps: ConfigArchiveDeps
  passwords: Map<string, string>
  keys: Map<string, string>
}

function harness({ refuseSecrets = false, cipher }: { refuseSecrets?: boolean; cipher?: ConfigArchiveDeps['cipher'] } = {}): Harness {
  const passwords = new Map<string, string>()
  const keys = new Map<string, string>()
  const general = {
    settings: { ...DEFAULT_GENERAL_SETTINGS },
    save: vi.fn((settings) => { general.settings = settings }),
  }
  const thresholds = {
    thresholds: { ...DEFAULT_BALANCE_THRESHOLDS },
    save: vi.fn((next) => { thresholds.thresholds = next; return true }),
  }
  const calendar = {
    config: { ...DEFAULT_CALENDAR_CONFIG },
    saveConfig: vi.fn((config: CalendarConfig) => { calendar.config = config }),
    loadPassword: vi.fn(async (config: CalendarConfig) => passwords.get(accountOf(config)) ?? ''),
    savePassword: vi.fn(async (config: CalendarConfig, password: string) => {
      if (refuseSecrets) return false
      passwords.set(accountOf(config), password)
      return true
    }),
  }
  const bankState = {
    bank: defaultBankState('2026-09-15', REDIRECT),
    save: vi.fn((next: BankState) => { bankState.bank = next }),
  }
  const bankKeys = {
    load: vi.fn(async (id: string) => keys.get(id) ?? ''),
    save: vi.fn(async (id: string, key: string) => {
      if (refuseSecrets) return false
      keys.set(id, key)
      return true
    }),
    remove: vi.fn(async (id: string) => { keys.delete(id) }),
  }
  const deps: ConfigArchiveDeps = { general, thresholds, calendar, bankState, bankKeys, cipher }
  return { service: new ConfigArchiveService(deps), deps, passwords, keys }
}

/** A machine with everything set up: calendar account and password, bank application and key. */
function configured(options: Parameters<typeof harness>[0] = {}): Harness {
  const h = harness(options)
  h.deps.general.save({ ...DEFAULT_GENERAL_SETTINGS, language: 'en', theme: 'dark' })
  h.deps.thresholds.save({ low: -100, medium: 0, high: 500 })
  h.deps.calendar.saveConfig({ ...CALENDAR, calendarUrl: ' https://dav.test/cal/ ' })
  h.passwords.set(accountOf(CALENDAR), 'dav-secret')
  h.deps.bankState.save({
    ...h.deps.bankState.bank,
    config: { ...h.deps.bankState.bank.config, applicationId: 'app-1', bankName: 'Banque Test', bankCountry: 'FR' },
    session: { sessionId: 's1', accounts: [], validUntil: '2027-01-01T00:00:00Z' },
    pendingState: 'pending',
  })
  h.keys.set('app-1', PEM)
  return h
}

function fullData(overrides: Partial<ConfigData> = {}): ConfigData {
  return {
    general: { ...DEFAULT_GENERAL_SETTINGS, language: 'en', currency: 'CHF' },
    thresholds: { low: -50, medium: 50, high: 150 },
    calendar: { ...CALENDAR, proxyUrl: '', password: 'new-dav-secret' },
    bank: {
      config: { applicationId: 'app-2', bankName: 'Autre Banque', bankCountry: 'FR', bankConsentSeconds: 100, redirectUrl: REDIRECT, importFrom: '2026-01-01' },
      privateKey: '-----BEGIN PRIVATE KEY-----\n QU JD \n-----END PRIVATE KEY-----',
    },
    ...overrides,
  }
}

let temp: TempDataDir
const fileIn = (name: string) => path.join(temp.root, name)

beforeEach(() => { temp = createTempUserDataDir() })
afterEach(() => {
  vi.restoreAllMocks()
  removeTempUserDataDir(temp)
})

describe('collect', () => {
  it('describes a fresh installation: defaults, no secrets, no bank section', async () => {
    const { service } = harness()
    await expect(service.collect()).resolves.toEqual({
      general: DEFAULT_GENERAL_SETTINGS,
      thresholds: DEFAULT_BALANCE_THRESHOLDS,
      calendar: { ...DEFAULT_CALENDAR_CONFIG, proxyUrl: '', password: '' },
      bank: null,
    })
  })

  it('gathers the settings with the calendar password and the bank key', async () => {
    const { service, deps } = configured()
    const data = await service.collect()
    expect(data.general).toEqual({ ...DEFAULT_GENERAL_SETTINGS, language: 'en', theme: 'dark' })
    expect(data.thresholds).toEqual({ low: -100, medium: 0, high: 500 })
    // The desktop uses no proxy, and the account is normalised before the password is looked up.
    expect(data.calendar).toEqual({ ...CALENDAR, proxyUrl: '', password: 'dav-secret' })
    expect(data.bank).toEqual({ config: deps.bankState.bank.config, privateKey: PEM })
    expect(data.bank?.config).not.toBe(deps.bankState.bank.config)
  })
})

describe('exportTo and read', () => {
  it('writes a file only the passphrase can open', async () => {
    const { service } = configured()
    const file = fileIn('config.budgetcfg')

    await expect(service.exportTo(file, PASSPHRASE)).resolves.toEqual({ calendar: true, calendarPassword: true, bank: true, bankKey: true })

    const written = fs.readFileSync(file, 'utf-8')
    expect(JSON.parse(written)).toMatchObject({ format: ENCRYPTED_CONFIG_FORMAT })
    expect(written).not.toContain('dav-secret')
    expect(written).not.toContain('QUJD')
    expect(written).not.toContain('app-1')

    expect(await service.read(file, PASSPHRASE)).toMatchObject(await service.collect())
  })

  it('accepts an injected cipher', async () => {
    const { service } = configured({ cipher: webCryptoConfigCipher(globalThis.crypto) })
    const file = fileIn('config.budgetcfg')
    await service.exportTo(file, PASSPHRASE)
    expect(await service.read(file, PASSPHRASE)).toMatchObject(await service.collect())
  })

  it('refuses a short passphrase before writing anything', async () => {
    const { service } = configured()
    const file = fileIn('config.budgetcfg')
    await expect(service.exportTo(file, 'short')).rejects.toThrow(fr.configGroup.errorWeakPassphrase)
    expect(fs.existsSync(file)).toBe(false)
  })

  it('reports a folder it cannot write to', async () => {
    const { service } = configured()
    await expect(service.exportTo(fileIn(path.join('missing', 'config.budgetcfg')), PASSPHRASE)).rejects.toThrow(fr.configGroup.writeFailed)
  })

  it('tells a wrong passphrase from a file that is not a configuration', async () => {
    const { service } = configured()
    const file = fileIn('config.budgetcfg')
    await service.exportTo(file, PASSPHRASE)
    await expect(service.read(file, 'not the passphrase')).rejects.toThrow(fr.configGroup.errorPassphrase)

    writeText(fileIn('backup.json'), JSON.stringify({ format: 'budget-app-backup', version: 1 }))
    await expect(service.read(fileIn('backup.json'), PASSPHRASE)).rejects.toThrow(fr.configGroup.errorFormat)

    writeText(fileIn('garbage.budgetcfg'), 'not json')
    await expect(service.read(fileIn('garbage.budgetcfg'), PASSPHRASE)).rejects.toThrow(fr.configGroup.errorFormat)

    await expect(service.read(fileIn('absent.budgetcfg'), PASSPHRASE)).rejects.toThrow(fr.configGroup.unreadable)
  })
})

describe('configFileErrorMessage', () => {
  it.each([
    ['format', fr.configGroup.errorFormat],
    ['passphrase', fr.configGroup.errorPassphrase],
    ['content', fr.configGroup.errorContent],
    ['weak-passphrase', fr.configGroup.errorWeakPassphrase],
  ] as const)('words the %s code', (code, message) => {
    expect(configFileErrorMessage(new ConfigFileError(code))).toBe(message)
  })

  it('passes other errors through and names the rest', () => {
    expect(configFileErrorMessage(new Error('disk full'))).toBe('disk full')
    expect(configFileErrorMessage('oops')).toBe(fr.configGroup.operationFailed)
  })
})

describe('apply', () => {
  it('replaces every section, stores the secrets and drops access granted to another bank application', async () => {
    const { service, deps, passwords, keys } = configured()
    const data = fullData()

    const report = await service.apply(data)

    expect(report).toEqual({
      sections: { calendar: true, calendarPassword: true, bank: true, bankKey: true },
      refused: { calendarPassword: false, bankKey: false },
    })
    expect(deps.general.settings).toEqual(data.general)
    expect(deps.thresholds.thresholds).toEqual(data.thresholds)
    expect(deps.calendar.config).toEqual(CALENDAR)
    expect(passwords.get(accountOf(CALENDAR))).toBe('new-dav-secret')
    expect(deps.bankState.bank.config).toEqual(data.bank?.config)
    expect(deps.bankState.bank.session).toBeNull()
    expect(deps.bankState.bank.pendingState).toBe('')
    expect(keys.get('app-2')).toBe(PEM)
    expect(keys.get('app-1')).toBe(PEM)
  })

  it('keeps the session when the bank application is the same', async () => {
    const { service, deps } = configured()
    const before = deps.bankState.bank
    const bank = { config: { ...before.config, importFrom: '2025-06-01' }, privateKey: '' }

    await service.apply(fullData({ bank }))

    expect(deps.bankState.bank.config.importFrom).toBe('2025-06-01')
    expect(deps.bankState.bank.session).toEqual(before.session)
    expect(deps.bankState.bank.pendingState).toBe('pending')
    expect(deps.bankState.bank.importedIds).toEqual(before.importedIds)
  })

  it('keeps the stored secrets when the file carries none', async () => {
    const { service, deps, passwords, keys } = configured()
    const data = fullData({
      calendar: { ...CALENDAR, proxyUrl: '', password: '' },
      bank: { config: { ...deps.bankState.bank.config }, privateKey: '' },
    })

    const report = await service.apply(data)

    expect(report.refused).toEqual({ calendarPassword: false, bankKey: false })
    expect(deps.calendar.savePassword).not.toHaveBeenCalled()
    expect(deps.bankKeys.save).not.toHaveBeenCalled()
    expect(passwords.get(accountOf(CALENDAR))).toBe('dav-secret')
    expect(keys.get('app-1')).toBe(PEM)
    expect(deps.calendar.config.enabled).toBe(true)
  })

  it('leaves the bank alone when the file has no bank section', async () => {
    const { service, deps } = configured()
    const before = deps.bankState.bank
    deps.bankState.save.mockClear()

    await service.apply(fullData({ bank: null }))

    expect(deps.bankState.save).not.toHaveBeenCalled()
    expect(deps.bankState.bank).toBe(before)
    expect(deps.bankKeys.save).not.toHaveBeenCalled()
  })

  it('does not enable the calendar without an account or a password', async () => {
    const { service, deps } = harness()

    await service.apply(fullData({ calendar: { enabled: true, calendarUrl: 'https://dav.test/other', username: 'bob', proxyUrl: '', password: '' } }))
    expect(deps.calendar.config).toEqual({ enabled: false, calendarUrl: 'https://dav.test/other', username: 'bob' })
    expect(deps.calendar.savePassword).not.toHaveBeenCalled()

    await service.apply(fullData({ calendar: { enabled: true, calendarUrl: '', username: '', proxyUrl: '', password: 'secret' } }))
    expect(deps.calendar.config).toEqual(DEFAULT_CALENDAR_CONFIG)
    expect(deps.calendar.savePassword).not.toHaveBeenCalled()
  })

  it('keeps the calendar disabled when the file says so, even with a password', async () => {
    const { service, deps, passwords } = harness()
    await service.apply(fullData({ calendar: { ...CALENDAR, enabled: false, proxyUrl: '', password: 'secret' } }))
    expect(passwords.get(accountOf(CALENDAR))).toBe('secret')
    expect(deps.calendar.config).toEqual({ ...CALENDAR, enabled: false })
  })

  it('reports the secrets the secure storage refused', async () => {
    const { service, deps } = harness({ refuseSecrets: true })

    const report = await service.apply(fullData())

    expect(report.refused).toEqual({ calendarPassword: true, bankKey: true })
    expect(deps.calendar.config.enabled).toBe(false)
    expect(deps.bankState.bank.config.applicationId).toBe('app-2')
  })

  it('refuses a bank key that is not a PEM and skips one without an application id', async () => {
    const { service, deps } = harness()

    const bank = fullData().bank!
    let report = await service.apply(fullData({ bank: { ...bank, privateKey: 'not a key' } }))
    expect(report.refused.bankKey).toBe(true)
    expect(deps.bankKeys.save).not.toHaveBeenCalled()

    report = await service.apply(fullData({ bank: { config: { ...bank.config, applicationId: '' }, privateKey: PEM } }))
    expect(report.refused.bankKey).toBe(false)
    expect(deps.bankKeys.save).not.toHaveBeenCalled()
  })

  it('importFrom reads then applies in one go', async () => {
    const source = configured()
    const file = fileIn('config.budgetcfg')
    await source.service.exportTo(file, PASSPHRASE)

    const target = harness()
    const report = await target.service.importFrom(file, PASSPHRASE)

    expect(report.sections).toEqual({ calendar: true, calendarPassword: true, bank: true, bankKey: true })
    expect(target.deps.general.settings).toEqual(source.deps.general.settings)
    expect(target.deps.thresholds.thresholds).toEqual(source.deps.thresholds.thresholds)
    expect(target.deps.calendar.config).toEqual(CALENDAR)
    expect(target.passwords.get(accountOf(CALENDAR))).toBe('dav-secret')
    expect(target.keys.get('app-1')).toBe(PEM)
    expect(target.deps.bankState.bank.config).toEqual(source.deps.bankState.bank.config)
  })
})
