/*
 * data/config-archive-service.ts — the configuration as a single encrypted
 * file, to set another machine up without typing everything again.
 *
 * The file holds what the data backup deliberately leaves out: the general
 * preferences, the thresholds, the calendar account and the bank application
 * — secrets included, the CalDAV password and the bank private key. That is
 * why it is sealed with a passphrase (format and cipher come from budget-lib,
 * shared with the mobile and web applications) and never written in clear.
 *
 * Reading a file and applying it are two steps, so the options dialog can
 * describe what the file holds before anything changes. Every failure is an
 * `Error` carrying a message the user can read, shown as a toast.
 */
import fs from 'node:fs'

import {
  ConfigFileError,
  describeConfig,
  isCalendarConfigComplete,
  normalizeCalendarConfig,
  normalizePrivateKey,
  openConfig,
  sealConfig,
  webCryptoConfigCipher,
  type BalanceThresholds,
  type BankConfigExport,
  type CalendarConfig,
  type ConfigCipher,
  type ConfigData,
  type GeneralSettings,
} from 'budget-lib'
import { t } from '../i18n/index.js'
import type { BankKeys, BankStateHolder } from './bank/bank-service.js'

/** The parts of the stores the service reads and writes; the classes of the data layer satisfy them. */
export interface ConfigGeneralHolder {
  readonly settings: GeneralSettings
  save(settings: GeneralSettings): void
}

export interface ConfigThresholdsHolder {
  readonly thresholds: BalanceThresholds
  save(thresholds: BalanceThresholds): boolean
}

export interface ConfigCalendarHolder {
  readonly config: CalendarConfig
  saveConfig(config: CalendarConfig): void
  loadPassword(config: CalendarConfig): Promise<string>
  savePassword(config: CalendarConfig, password: string): Promise<boolean>
}

export interface ConfigArchiveDeps {
  general: ConfigGeneralHolder
  thresholds: ConfigThresholdsHolder
  calendar: ConfigCalendarHolder
  bankState: BankStateHolder
  bankKeys: BankKeys
  /** Node 20+ exposes WebCrypto globally; tests may inject a faster one. */
  cipher?: ConfigCipher
}

export type ConfigSections = ReturnType<typeof describeConfig>

export interface ConfigImportReport {
  sections: ConfigSections
  /** Secrets the file held that the secure storage of this machine refused. */
  refused: { calendarPassword: boolean; bankKey: boolean }
}

export class ConfigArchiveService {
  readonly #deps: ConfigArchiveDeps
  readonly #cipher: ConfigCipher

  constructor(deps: ConfigArchiveDeps) {
    this.#deps = deps
    this.#cipher = deps.cipher ?? webCryptoConfigCipher(globalThis.crypto)
  }

  /** Everything the application is set up with, secrets included. */
  async collect(): Promise<ConfigData> {
    const { general, thresholds, calendar, bankState, bankKeys } = this.#deps
    const calendarConfig = normalizeCalendarConfig(calendar.config)
    const { config: bankConfig } = bankState.bank
    const bank: BankConfigExport | null = bankConfig.applicationId === ''
      ? null
      : { config: { ...bankConfig }, privateKey: await bankKeys.load(bankConfig.applicationId) }

    return {
      general: { ...general.settings },
      thresholds: { ...thresholds.thresholds },
      // The desktop talks to the calendar directly: no CORS proxy.
      calendar: { ...calendarConfig, proxyUrl: '', password: await calendar.loadPassword(calendarConfig) },
      bank,
    }
  }

  async exportTo(filePath: string, passphrase: string): Promise<ConfigSections> {
    const data = await this.collect()
    const text = await translateErrors(() => sealConfig(data, passphrase, this.#cipher))
    writeFile(filePath, text)
    return describeConfig(data)
  }

  /** Decrypts a file without applying it — used to describe it before asking. */
  async read(filePath: string, passphrase: string): Promise<ConfigData> {
    const text = readFile(filePath)
    return translateErrors(() => openConfig(text, passphrase, this.#cipher))
  }

  /**
   * Applies a configuration. An empty secret keeps the one already stored;
   * a file without a bank section leaves the bank alone.
   */
  async apply(data: ConfigData): Promise<ConfigImportReport> {
    const { general, thresholds } = this.#deps
    general.save(data.general)
    thresholds.save(data.thresholds)
    const calendarPassword = await this.applyCalendar(data)
    const bankKey = await this.applyBank(data)
    return { sections: describeConfig(data), refused: { calendarPassword, bankKey } }
  }

  async importFrom(filePath: string, passphrase: string): Promise<ConfigImportReport> {
    return this.apply(await this.read(filePath, passphrase))
  }

  /** Returns whether a password the file held could not be stored. */
  private async applyCalendar(data: ConfigData): Promise<boolean> {
    const { calendar } = this.#deps
    const { enabled, calendarUrl, username, syncIntervalMinutes, password } = data.calendar
    const config = normalizeCalendarConfig({ enabled, calendarUrl, username, syncIntervalMinutes })
    const complete = isCalendarConfigComplete(config)

    let stored = false
    if (password !== '' && complete) stored = await calendar.savePassword(config, password)
    const hasPassword = stored || (await calendar.loadPassword(config)) !== ''
    // Enabling without an account or a password would only produce errors.
    calendar.saveConfig({ ...config, enabled: enabled && complete && hasPassword })
    return password !== '' && !stored
  }

  /** Returns whether a key the file held could not be stored. */
  private async applyBank(data: ConfigData): Promise<boolean> {
    if (data.bank === null) return false
    const { bankState, bankKeys } = this.#deps
    const { config, privateKey } = data.bank

    let refused = false
    if (privateKey !== '' && config.applicationId !== '') {
      const key = normalizePrivateKey(privateKey)
      refused = key === '' || !(await bankKeys.save(config.applicationId, key))
    }

    const current = bankState.bank
    // Access granted to another application id is of no use to this one.
    const sameApplication = current.config.applicationId === config.applicationId
    bankState.save({
      ...current,
      config: { ...config },
      session: sameApplication ? current.session : null,
      pendingState: sameApplication ? current.pendingState : '',
    })
    return refused
  }
}

/** The library's error codes, in the user's words. */
export function configFileErrorMessage(error: unknown): string {
  const strings = t().configGroup
  if (error instanceof ConfigFileError) {
    switch (error.code) {
      case 'format': return strings.errorFormat
      case 'passphrase': return strings.errorPassphrase
      case 'content': return strings.errorContent
      case 'weak-passphrase': return strings.errorWeakPassphrase
    }
  }
  return error instanceof Error ? error.message : strings.operationFailed
}

async function translateErrors<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    throw new Error(configFileErrorMessage(error), { cause: error })
  }
}

function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    throw new Error(t().configGroup.unreadable)
  }
}

function writeFile(filePath: string, contents: string): void {
  try {
    fs.writeFileSync(filePath, contents, 'utf-8')
  } catch {
    throw new Error(t().configGroup.writeFailed)
  }
}
