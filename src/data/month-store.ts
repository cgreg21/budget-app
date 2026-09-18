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

import { compareMonthsDesc, type MonthKey } from '../domain/month.js'
import {
  isTransactionArray,
  sortByDateDesc,
  type Transaction,
  type TransactionInput,
} from '../domain/transaction.js'
import { createId } from './id.js'
import { JsonFileStore } from './json-file-store.js'
import { MONTHS_DIR, monthFilePath, monthFromFileName } from './paths.js'
import { assertRemoteWritable, pushToRemote, removeFromRemote } from './remote/gateway.js'

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
 *
 * Like every other write, refused while the remote budget is unreachable.
 */
export function writeMonthTransactions(month: MonthKey, transactions: readonly Transaction[]): void {
  assertRemoteWritable()
  const filePath = monthFilePath(month)
  fs.mkdirSync(MONTHS_DIR, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(sortByDateDesc(transactions), null, 2), 'utf-8')
  pushToRemote(filePath)
}

/** Removes a month from the history. Silent when the file is already gone. */
export function deleteMonthFile(month: MonthKey): void {
  assertRemoteWritable()
  const filePath = monthFilePath(month)
  try {
    fs.rmSync(filePath)
  } catch {
    // never created, or already removed
  }
  removeFromRemote(filePath)
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
