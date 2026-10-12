/*
 * data/month-store.ts — the transactions of a single month, persisted to
 * `months/<YYYY-MM>.json`.
 *
 * All mutations are expressed as a new array handed to `commit()`, which
 * sorts it, writes the file and notifies subscribers.
 *
 * The module also exposes plain file helpers used by import and export: they
 * touch a month without opening a store — hence without installing a watcher —
 * which is what a bulk rewrite of the whole history needs.
 */
import fs from 'node:fs'

import {
  compareMonthsDesc,
  type MonthKey,
  isTransactionArray,
  sortByDateDesc,
  type Transaction,
  type TransactionInput,
} from 'budget-lib'
import { writeFileAtomic } from './atomic-write.js'
import { createId } from './id.js'
import { JsonFileStore } from './json-file-store.js'
import { MONTHS_DIR, monthFilePath, monthFromFileName } from './paths.js'

/** Months that already have a file on disk, most recent first. */
export function listStoredMonths(): MonthKey[] {
  let fileNames: string[]
  try {
    fileNames = fs.readdirSync(MONTHS_DIR)
  } catch {
    return [] // no history yet
  }

  return fileNames
    .map(monthFromFileName)
    .filter((month): month is MonthKey => month !== null)
    .sort(compareMonthsDesc)
}

/** The transactions of a month, straight from disk. Empty when absent or invalid. */
export function readMonthTransactions(month: MonthKey): Transaction[] {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(monthFilePath(month), 'utf-8'))
    return isTransactionArray(raw) ? raw : []
  } catch {
    return []
  }
}

/**
 * Overwrites a month file. An open `MonthStore` sees the change through its
 * watcher, so callers only have to refresh what they hold themselves.
 */
export function writeMonthTransactions(month: MonthKey, transactions: readonly Transaction[]): void {
  writeFileAtomic(monthFilePath(month), JSON.stringify(sortByDateDesc(transactions), null, 2))
}

/** Removes a month from the history. Silent when the file is already gone. */
export function deleteMonthFile(month: MonthKey): void {
  const filePath = monthFilePath(month)
  try {
    fs.rmSync(filePath)
  } catch {
    // never created, or already removed
  }
}

export class MonthStore extends JsonFileStore<Transaction[]> {
  readonly month: MonthKey

  constructor(month: MonthKey) {
    super(monthFilePath(month))
    this.month = month
  }

  get transactions(): readonly Transaction[] {
    return this.state
  }

  add(input: TransactionInput): void {
    this.addMany([input])
  }

  /** Adds several transactions in a single write — used to apply recurrences. */
  addMany(inputs: readonly TransactionInput[]): void {
    if (inputs.length === 0) return
    this.commit([...this.state, ...inputs.map((input) => ({ id: createId(), ...input }))])
  }

  /**
   * Adds transactions that already have an id — those of a bank import — in a
   * single write, skipping the ones this month already holds. Returns how many
   * were added.
   */
  importMany(transactions: readonly Transaction[]): number {
    const known = new Set(this.state.map((transaction) => transaction.id))
    const fresh = transactions.filter((transaction) => !known.has(transaction.id))
    if (fresh.length === 0) return 0
    this.commit([...this.state, ...fresh])
    return fresh.length
  }

  /** Replace an existing transaction's fields, keeping its id. No-op if the id is unknown. */
  update(id: string, input: TransactionInput): void {
    if (!this.state.some((transaction) => transaction.id === id)) return
    this.commit(this.state.map((transaction) => (transaction.id === id ? { id, ...input } : transaction)))
  }

  remove(id: string): void {
    this.commit(this.state.filter((transaction) => transaction.id !== id))
  }

  protected parse(raw: unknown): Transaction[] | null {
    return isTransactionArray(raw) ? raw : null
  }

  protected createDefault(): Transaction[] {
    return []
  }

  protected override normalize(state: Transaction[]): Transaction[] {
    return sortByDateDesc(state)
  }
}
