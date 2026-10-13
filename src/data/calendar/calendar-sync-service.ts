import {
  CalDavClient, CalendarError, isCalendarConfigComplete, normalizeCalendarConfig,
  syncCalendar, transactionHash,
  type CalendarConfig, type CalendarStatus, type HttpTransport, type Transaction,
} from 'budget-lib'
import type { BudgetStore } from '../budget-store.js'
import type { CategoryStore } from '../category-store.js'
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
  transport?: HttpTransport
  passwords?: CalendarPasswordStore
  stateStore?: CalendarStateStore
}

function fingerprint(transactions: readonly Transaction[]): string {
  return JSON.stringify(transactions.map(transactionHash).sort())
}

export class CalendarSyncService {
  readonly #budget: BudgetStore
  readonly #categories: CategoryStore
  readonly #state: CalendarStateStore
  readonly #passwords: CalendarPasswordStore
  readonly #transport: HttpTransport
  readonly #listeners = new Set<StoreListener>()
  readonly #unsubscribe: Unsubscribe
  readonly #ownsState: boolean
  #status: CalendarStatus
  #observed: string
  #timer?: NodeJS.Timeout
  #retry?: NodeJS.Timeout
  #running?: Promise<void>
  #dirty = false
  #applying = false
  #started = false
  #disposed = false
  #version = 0

  constructor({ budgetStore, categoryStore, transport = nodeCalendarTransport,
    passwords = new CalendarPasswordStore(), stateStore }: CalendarSyncOptions) {
    this.#budget = budgetStore
    this.#categories = categoryStore
    this.#passwords = passwords
    this.#ownsState = stateStore === undefined
    this.#state = stateStore ?? new CalendarStateStore()
    this.#transport = async (request) => {
      try { return await transport(request) }
      catch (error) { throw new NetworkFailure(error instanceof Error ? error.message : String(error)) }
    }
    this.#status = { state: this.config.enabled ? 'offline' : 'disabled', lastSync: this.#state.calendar.lastSync }
    this.#observed = fingerprint(this.#budget.allTransactions)
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
    this.schedule()
  }

  async savePassword(config: CalendarConfig, password: string): Promise<boolean> {
    if (!isCalendarConfigComplete(normalizeCalendarConfig(config))) throw new Error(t().calendarGroup.incompleteSettings)
    const saved = await this.#passwords.save(config, password)
    if (saved) this.schedule()
    return saved
  }

  async hasPassword(config: CalendarConfig): Promise<boolean> {
    return (await this.#passwords.load(config)) !== ''
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
    void this.syncNow()
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
    this.#unsubscribe()
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
      const result = await syncCalendar(new CalDavClient(config, password, this.#transport), local, this.#state.calendar.baseline)
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
        for (const transaction of upserts) this.#categories.add(transaction.category)
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
