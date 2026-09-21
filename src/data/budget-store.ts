/*
 * data/budget-store.ts — the budget seen as a history of months.
 *
 * The store owns one `MonthStore` (one JSON file) per month it has been asked
 * about, keeps track of which month is on screen, and exposes the selected
 * month's data as if it were a single list.
 *
 * Any month can be reached, past or future: browsing is pure navigation, and
 * the file of a month is only created once it receives its first transaction —
 * or once a recurrence is due in it, since recurrences are materialised as
 * soon as their month is opened.
 * Every month is editable — adding, editing and deleting all apply to the
 * month currently loaded, and a new transaction is filed under the month of
 * its date, which the UI derives from the selected month.
 */
import fs from 'node:fs'

import {
  clampMonth,
  currentMonthKey,
  defaultDateInMonth,
  FIRST_MONTH,
  isMonthKey,
  LAST_MONTH,
  monthKeyOf,
  shiftMonth,
  type MonthKey,
} from '../domain/month.js'
import {
  missingOccurrences,
  recurrenceFromTransaction,
  type Recurrence,
  type RecurrenceSettings,
} from '../domain/recurrence.js'
import { computeTotals, type Totals, type Transaction, type TransactionInput } from '../domain/transaction.js'
import { createId } from './id.js'
import type { StoreListener, Unsubscribe } from './json-file-store.js'
import { migrateLegacyTransactions } from './legacy-migration.js'
import { listStoredMonths, MonthStore, readMonthTransactions } from './month-store.js'
import { MONTHS_DIR, monthFromFileName } from './paths.js'
import type { RecurrenceStore } from './recurrence-store.js'

/** A month file may be created or removed by another instance or a sync tool. */
const REFRESH_DEBOUNCE_MS = 150

export class BudgetStore {
  readonly #monthStores = new Map<MonthKey, MonthStore>()
  readonly #listeners = new Set<StoreListener>()
  readonly #recurrences: RecurrenceStore
  readonly #unsubscribeRecurrences: Unsubscribe
  #monthsWithData: readonly MonthKey[] = []
  #selectedMonth: MonthKey
  #watcher?: fs.FSWatcher
  #refreshTimer?: NodeJS.Timeout

  constructor(recurrences: RecurrenceStore) {
    migrateLegacyTransactions()
    this.#recurrences = recurrences
    this.#selectedMonth = currentMonthKey()
    this.#refreshMonthsWithData()
    this.#watchMonthsDirectory()
    this.#unsubscribeRecurrences = recurrences.onChange(() => this.#applyRecurrences())
    this.#applyRecurrences()
  }

  /** The month "today" belongs to — recomputed so it survives midnight. */
  get currentMonth(): MonthKey {
    return currentMonthKey()
  }

  get selectedMonth(): MonthKey {
    return this.#selectedMonth
  }

  /** Months that already have a file, most recent first. May exclude the selected one. */
  get monthsWithData(): readonly MonthKey[] {
    return this.#monthsWithData
  }

  /** The date a transaction created now would get, so it lands in the selected month. */
  get defaultTransactionDate(): string {
    return defaultDateInMonth(this.#selectedMonth)
  }

  get hasOlderMonth(): boolean {
    return this.#selectedMonth > FIRST_MONTH
  }

  get hasNewerMonth(): boolean {
    return this.#selectedMonth < LAST_MONTH
  }

  get transactions(): readonly Transaction[] {
    return this.#monthStore(this.#selectedMonth).transactions
  }

  get totals(): Totals {
    return computeTotals(this.transactions)
  }

  /** Totals for every month that has transactions, oldest first for charts. */
  get monthlyTotals(): readonly { month: MonthKey, income: number, expense: number }[] {
    return [...this.#monthsWithData].reverse().map((month) => {
      const { income, expense } = computeTotals(readMonthTransactions(month))
      return { month, income, expense }
    })
  }

  /** Shows any month, with or without data; unknown keys are ignored. */
  selectMonth(month: MonthKey): void {
    if (!isMonthKey(month)) return

    const next = clampMonth(month)
    if (next === this.#selectedMonth) return

    this.#selectedMonth = next
    this.#pruneMonthStores()
    this.#applyRecurrences()
    this.#notify()
  }

  selectOlderMonth(): void {
    this.selectMonth(shiftMonth(this.#selectedMonth, -1))
  }

  selectNewerMonth(): void {
    this.selectMonth(shiftMonth(this.#selectedMonth, 1))
  }

  /** Files the transaction under the month of its date, and shows that month. */
  add(input: TransactionInput): void {
    const month = monthKeyOf(input.date)
    this.selectMonth(month)
    this.#monthStore(month).add(input)
  }

  /**
   * Adds a transaction and the series it starts. The transaction is stamped
   * with the new recurrence *before* the series is published, so the month it
   * lands in is not filled with a second, identical occurrence.
   */
  addRecurring(input: TransactionInput, settings: RecurrenceSettings): void {
    const recurrence: Recurrence = {
      id: createId(),
      ...recurrenceFromTransaction(input, settings),
    }
    this.add({ ...input, recurrenceId: recurrence.id })
    this.#recurrences.insert(recurrence)
  }

  /** The series a transaction belongs to, if it still exists. */
  recurrenceOf(transaction: Transaction): Recurrence | undefined {
    return this.#recurrences.find(transaction.recurrenceId)
  }

  update(id: string, input: TransactionInput): void {
    this.#monthStore(this.#selectedMonth).update(id, input)
  }

  /**
   * Applies an edit to the whole series: the template follows the transaction,
   * is created when there was none, and is dropped when the transaction
   * becomes one-off. Occurrences already written to other months are left as
   * they are — only the months opened from now on see the new settings.
   */
  updateSeries(id: string, input: TransactionInput, settings: RecurrenceSettings | null): void {
    const current = this.#recurrences.find(input.recurrenceId)

    if (settings === null) {
      if (current) this.#recurrences.remove(current.id)
      this.update(id, { ...input, recurrenceId: undefined })
      return
    }

    const next = recurrenceFromTransaction(input, settings)

    if (current) {
      // The day and the start month belong to the series, not to the
      // occurrence being edited: editing the February occurrence of a series
      // falling on the 31st must not shrink it to the 28th, and editing it
      // from a later month must not cut the earlier ones off.
      this.update(id, input)
      this.#recurrences.update(current.id, {
        ...next,
        day: current.day,
        startMonth: current.startMonth,
      })
      return
    }

    const recurrence: Recurrence = { id: createId(), ...next }
    this.update(id, { ...input, recurrenceId: recurrence.id })
    this.#recurrences.insert(recurrence)
  }

  remove(id: string): void {
    this.#monthStore(this.#selectedMonth).remove(id)
  }

  /**
   * Drops every month held in memory and reads the history again. Month files
   * rewritten behind the store's back — by an import — are picked up at once,
   * including the disappearance of the ones a full restore removed, which a
   * file watcher alone cannot report.
   */
  reload(): void {
    for (const store of this.#monthStores.values()) store.dispose()
    this.#monthStores.clear()
    this.#refreshMonthsWithData()
    this.#applyRecurrences()
    this.#notify()
  }

  /** Subscribe to data changes *and* to month navigation. */
  onChange(listener: StoreListener): Unsubscribe {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  dispose(): void {
    this.#unsubscribeRecurrences()
    this.#watcher?.close()
    this.#watcher = undefined
    if (this.#refreshTimer) clearTimeout(this.#refreshTimer)
    this.#refreshTimer = undefined
    for (const store of this.#monthStores.values()) store.dispose()
    this.#monthStores.clear()
    this.#listeners.clear()
  }

  /** Month stores are created on demand and cached, so navigation stays instant. */
  #monthStore(month: MonthKey): MonthStore {
    const cached = this.#monthStores.get(month)
    if (cached) return cached

    const store = new MonthStore(month)
    store.onChange(() => this.#onMonthChanged(month))
    this.#monthStores.set(month, store)
    return store
  }

  /**
   * Browsing is unlimited, so empty months left behind would pile up watchers
   * for files that do not even exist. They cost nothing to rebuild on demand.
   */
  #pruneMonthStores(): void {
    for (const [month, store] of this.#monthStores) {
      if (month === this.#selectedMonth || store.transactions.length > 0) continue
      store.dispose()
      this.#monthStores.delete(month)
    }
  }

  /**
   * Writes the occurrences the selected month is still missing. Called when a
   * month is opened and when the templates change, so consulting a month is
   * enough to see its recurring transactions. Transactions already stamped
   * with a recurrence id are left as they are, which makes this idempotent.
   */
  #applyRecurrences(): void {
    const month = this.#selectedMonth
    const store = this.#monthStore(month)
    store.addMany(missingOccurrences(this.#recurrences.recurrences, month, store.transactions))
  }

  #onMonthChanged(month: MonthKey): void {
    // A write may have created a brand-new month file.
    const monthsChanged = this.#refreshMonthsWithData()
    if (monthsChanged || month === this.#selectedMonth) this.#notify()
  }

  /** Returns true when the list actually changed. */
  #refreshMonthsWithData(): boolean {
    const next = listStoredMonths()
    const unchanged =
      next.length === this.#monthsWithData.length &&
      next.every((month, index) => month === this.#monthsWithData[index])
    if (unchanged) return false

    this.#monthsWithData = next
    return true
  }

  #watchMonthsDirectory(): void {
    try {
      fs.mkdirSync(MONTHS_DIR, { recursive: true })
      this.#watcher = fs.watch(MONTHS_DIR, (_eventType, fileName) => {
        if (fileName && monthFromFileName(fileName) === null) return
        if (this.#refreshTimer) clearTimeout(this.#refreshTimer)
        this.#refreshTimer = setTimeout(() => {
          if (this.#refreshMonthsWithData()) this.#notify()
        }, REFRESH_DEBOUNCE_MS)
      })
    } catch {
      // Watching isn't available here: months added from outside simply won't
      // appear until the next launch.
    }
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) listener()
  }
}
