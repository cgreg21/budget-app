import {
  CalDavClient, CalendarError, isCalendarConfigComplete, normalizeCalendarConfig,
  syncCalendar, recurrenceHash, transactionHash,
  type CalendarConfig, type CalendarStatus, type Category, type HttpTransport, type Recurrence, type Transaction,
} from 'budget-lib'
import type { BudgetStore } from '../budget-store.js'
import type { CategoryStore } from '../category-store.js'
import type { RecurrenceStore } from '../recurrence-store.js'
import type { StoreListener, Unsubscribe } from '../json-file-store.js'
import type { SecureStoreBackendName } from '../secure-store.js'
import { t } from '../../i18n/index.js'
import { CalendarPasswordStore } from './calendar-password-store.js'
import { CalendarStateStore } from './calendar-state-store.js'
import { nodeCalendarTransport } from './node-calendar.js'

const DEBOUNCE_MS = 2_000
const RETRY_MS = 60_000

class NetworkFailure extends Error {}

function errorMessage(error: unknown): string {
  if (error instanceof CalendarError) {
    const strings = t().calendarGroup
    switch (error.kind) {
      case 'auth': return strings.authFailed
      case 'not-found': return strings.calendarNotFound
      case 'conflict': return strings.conflict
      case 'server': return strings.serverError(error.status)
    }
  }
  return error instanceof Error ? error.message : String(error)
}

export interface CalendarSyncOptions {
  budgetStore: BudgetStore
  categoryStore: CategoryStore
  recurrenceStore: RecurrenceStore
  transport?: HttpTransport
  passwords?: CalendarPasswordStore
  stateStore?: CalendarStateStore
}

function categoryFingerprint(categories: readonly Category[]): string {
  return JSON.stringify(categories.map(({ name, icon }) => [name, icon]))
}

function fingerprint(transactions: readonly Transaction[]): string {
  return JSON.stringify(transactions.map(transactionHash).sort())
}

function recurrenceFingerprint(recurrences: readonly Recurrence[]): string {
  return JSON.stringify(recurrences.map(recurrenceHash).sort())
}

export class CalendarSyncService {
  readonly #budget: BudgetStore
  readonly #categories: CategoryStore
  readonly #recurrences: RecurrenceStore
  readonly #state: CalendarStateStore
  readonly #passwords: CalendarPasswordStore
  readonly #transport: HttpTransport
  readonly #listeners = new Set<StoreListener>()
  readonly #unsubscribe: Unsubscribe
  readonly #unsubscribeCategories: Unsubscribe
  readonly #unsubscribeRecurrences: Unsubscribe
  readonly #ownsState: boolean
  #status: CalendarStatus
  #observed: string
  #observedCategories: string
  #observedRecurrences: string
  #timer?: NodeJS.Timeout
  #retry?: NodeJS.Timeout
  #periodic?: NodeJS.Timeout
  #running?: Promise<void>
  #dirty = false
  #applying = false
  #started = false
  #disposed = false
  #version = 0

  constructor({ budgetStore, categoryStore, recurrenceStore, transport = nodeCalendarTransport,
    passwords = new CalendarPasswordStore(), stateStore }: CalendarSyncOptions) {
    this.#budget = budgetStore
    this.#categories = categoryStore
    this.#recurrences = recurrenceStore
    this.#passwords = passwords
    this.#ownsState = stateStore === undefined
    this.#state = stateStore ?? new CalendarStateStore()
    this.#transport = async (request) => {
      try { return await transport(request) }
      catch (error) { throw new NetworkFailure(error instanceof Error ? error.message : String(error)) }
    }
    this.#status = { state: this.config.enabled ? 'offline' : 'disabled', lastSync: this.#state.calendar.lastSync }
    this.#observed = fingerprint(this.#budget.allTransactions)
    this.#observedCategories = categoryFingerprint(this.#categories.categories)
    this.#unsubscribeCategories = this.#categories.onChange(() => {
      if (this.#disposed || this.#applying) return
      const current = categoryFingerprint(this.#categories.categories)
      if (current === this.#observedCategories) return
      this.#observedCategories = current
      this.schedule()
    })
    this.#observedRecurrences = recurrenceFingerprint(this.#recurrences.recurrences)
    this.#unsubscribeRecurrences = this.#recurrences.onChange(() => {
      if (this.#disposed || this.#applying) return
      const current = recurrenceFingerprint(this.#recurrences.recurrences)
      if (current === this.#observedRecurrences) return
      this.#observedRecurrences = current
      this.schedule()
    })
    this.#unsubscribe = this.#budget.onTransactionsChange(() => {
      if (this.#disposed || this.#applying) return
      const current = fingerprint(this.#budget.allTransactions)
      if (current === this.#observed) return
      this.#observed = current
      this.schedule()
    })
  }

  get config(): CalendarConfig { return { ...this.#state.calendar.config } }
  get status(): CalendarStatus { return { ...this.#status } }

  onStatusChange(listener: StoreListener): Unsubscribe {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  saveConfig(config: CalendarConfig): void {
    const normalized = normalizeCalendarConfig(config)
    if (config.enabled && !isCalendarConfigComplete(normalized)) throw new Error(t().calendarGroup.incompleteSettings)
    const previous = this.#state.calendar
    const changedAccount = previous.config.calendarUrl !== normalized.calendarUrl || previous.config.username !== normalized.username
    this.#version++
    this.clearTimers()
    this.#state.save({ config: normalized, baseline: changedAccount ? {} : previous.baseline,
      lastSync: changedAccount ? undefined : previous.lastSync })
    this.setStatus({ state: normalized.enabled ? 'offline' : 'disabled', lastSync: this.#state.calendar.lastSync })
    this.#dirty = false
    this.restartPeriodic()
    this.schedule()
  }

  async savePassword(config: CalendarConfig, password: string): Promise<boolean> {
    if (!isCalendarConfigComplete(normalizeCalendarConfig(config))) throw new Error(t().calendarGroup.incompleteSettings)
    const saved = await this.#passwords.save(config, password)
    if (saved) this.schedule()
    return saved
  }

  async hasPassword(config: CalendarConfig): Promise<boolean> {
    return (await this.loadPassword(config)) !== ''
  }

  /** The stored password, or '' — only the configuration export reads it; the UI never does. */
  loadPassword(config: CalendarConfig): Promise<string> {
    return this.#passwords.load(config)
  }

  /** How the password is kept on this machine, or `null` when it cannot be. */
  passwordStorage(): Promise<SecureStoreBackendName | null> {
    return this.#passwords.backendName()
  }

  async checkConnection(config: CalendarConfig, password?: string): Promise<void> {
    const normalized = normalizeCalendarConfig(config)
    if (!isCalendarConfigComplete(normalized)) throw new Error(t().calendarGroup.incompleteSettings)
    const secret = password ?? await this.#passwords.load(normalized)
    if (secret === '') throw new Error(t().calendarGroup.incompleteSettings)
    try { await new CalDavClient(normalized, secret, this.#transport).check() }
    catch (error) {
      if (error instanceof CalendarError || error instanceof NetworkFailure) {
        throw new Error(error instanceof NetworkFailure ? t().calendarGroup.stateOffline : errorMessage(error), { cause: error })
      }
      throw error
    }
  }

  start(): void {
    if (this.#started || this.#disposed) return
    this.#started = true
    this.restartPeriodic()
    void this.syncNow()
  }

  /** Automatic synchronisation every `syncIntervalMinutes`; off when the calendar is disabled or the interval is 0. */
  private restartPeriodic(): void {
    if (this.#periodic) clearInterval(this.#periodic)
    this.#periodic = undefined
    const minutes = this.config.syncIntervalMinutes ?? 0
    if (!this.#started || this.#disposed || !this.config.enabled || minutes <= 0) return
    this.#periodic = setInterval(() => void this.syncNow(), minutes * 60_000)
    this.#periodic.unref()
  }

  resume(): void {
    if (this.#started) void this.syncNow()
  }

  syncNow(): Promise<void> {
    if (this.#disposed || !this.config.enabled) return this.#running ?? Promise.resolve()
    this.clearTimers()
    this.#dirty = true
    if (!this.#running) {
      this.#running = this.drain().finally(() => { this.#running = undefined })
    }
    return this.#running
  }

  dispose(): void {
    this.#disposed = true
    this.#version++
    this.clearTimers()
    if (this.#periodic) clearInterval(this.#periodic)
    this.#unsubscribe()
    this.#unsubscribeCategories()
    this.#unsubscribeRecurrences()
    this.#listeners.clear()
    if (this.#ownsState) this.#state.dispose()
  }

  private schedule(): void {
    if (!this.#started || this.#disposed || !this.config.enabled) return
    if (this.#running) { this.#dirty = true; return }
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = setTimeout(() => { this.#timer = undefined; void this.syncNow() }, DEBOUNCE_MS)
    this.#timer.unref()
  }

  private async drain(): Promise<void> {
    while (this.#dirty && !this.#disposed && this.config.enabled) {
      this.#dirty = false
      await this.runOnce()
    }
  }

  private async runOnce(): Promise<void> {
    const version = this.#version
    const config = this.config
    const lastSync = this.#state.calendar.lastSync
    this.setStatus({ state: 'syncing', lastSync })
    try {
      if (!isCalendarConfigComplete(config)) throw new Error(t().calendarGroup.incompleteSettings)
      const password = await this.#passwords.load(config)
      if (password === '') throw new Error(t().calendarGroup.incompleteSettings)
      if (this.#disposed || version !== this.#version) return
      const local = this.#budget.allTransactions
      const sent = new Map(local.map((transaction) => [transaction.id, transactionHash(transaction)]))
      const localCategories = this.#categories.categories.map(({ name, icon }) => ({ name, icon }))
      const result = await syncCalendar(new CalDavClient(config, password, this.#transport), local, this.#state.calendar.baseline, localCategories, this.#recurrences.recurrences)
      if (this.#disposed || version !== this.#version) return
      const currentTransactions = this.#budget.allTransactions
      if (fingerprint(currentTransactions) !== fingerprint(local)) this.#dirty = true
      const current = new Map(currentTransactions.map((transaction) => [transaction.id, transactionHash(transaction)]))
      // A user can edit while REPORT/PUT are in flight. Those edits must win
      // locally and be sent in the next run, not overwritten by this snapshot.
      const unchanged = (id: string) => current.get(id) === sent.get(id)
      const upserts = result.upsertLocal.filter((transaction) => unchanged(transaction.id))
      const removed = result.removeLocal.filter(unchanged)
      this.#applying = true
      try {
        if (result.categories !== null) {
          // Category edits made during the run win and are sent in the next one.
          if (categoryFingerprint(this.#categories.categories) === categoryFingerprint(localCategories)) this.#categories.replaceAll(result.categories)
          else this.#dirty = true
        }
        this.#observedCategories = categoryFingerprint(this.#categories.categories)
        this.#budget.applyCalendarChanges(upserts, removed)
        this.#observed = fingerprint(this.#budget.allTransactions)
        const now = new Date().toISOString()
        this.#state.save({ config, baseline: result.baseline, lastSync: now })
        this.setStatus({ state: 'online', lastSync: now })
        if (result.skipped > 0) this.retryLater()
      } finally { this.#applying = false }
    } catch (error) {
      if (this.#disposed || version !== this.#version) return
      if (error instanceof NetworkFailure) {
        this.setStatus({ state: 'offline', lastSync, message: t().calendarGroup.stateOffline })
        this.retryLater()
      } else {
        this.setStatus({ state: 'error', lastSync,
          message: errorMessage(error) })
      }
    }
  }

  private retryLater(): void {
    if (!this.#started || this.#disposed || !this.config.enabled) return
    if (this.#retry) clearTimeout(this.#retry)
    this.#retry = setTimeout(() => { this.#retry = undefined; void this.syncNow() }, RETRY_MS)
    this.#retry.unref()
  }

  private clearTimers(): void {
    if (this.#timer) clearTimeout(this.#timer)
    if (this.#retry) clearTimeout(this.#retry)
    this.#timer = this.#retry = undefined
  }

  private setStatus(status: CalendarStatus): void {
    this.#status = status
    for (const listener of [...this.#listeners]) listener()
  }
}
