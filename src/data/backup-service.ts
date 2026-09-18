/*
 * data/backup-service.ts — reading and writing the whole budget as a file.
 *
 * Two exchange formats sit side by side:
 *   - a JSON archive, complete and lossless, meant to be restored;
 *   - a CSV of the transactions, meant for a spreadsheet.
 *
 * Both write month files directly instead of going through `MonthStore`:
 * restoring rewrites the entire history at once, which no per-month store is
 * meant to do. The stores are told to catch up afterwards with
 * `BudgetStore.reload()`, the single point where the app faces its new data.
 *
 * Every failure is raised as an `Error` carrying a message the user can read:
 * the options dialog shows it as a toast.
 */
import fs from 'node:fs'

import {
  countBackup,
  createArchive,
  mergeBackups,
  parseBackupData,
  type BackupCounts,
  type BackupData,
  type ImportMode,
} from '../domain/backup.js'
import { DEFAULT_CATEGORY_ICON, type Category } from '../domain/category.js'
import { csvToTransactions, transactionsToCsv } from '../domain/csv.js'
import { monthKeyOf, type MonthKey } from '../domain/month.js'
import type { Transaction } from '../domain/transaction.js'
import type { BudgetStore } from './budget-store.js'
import type { CategoryStore } from './category-store.js'
import { createId } from './id.js'
import {
  deleteMonthFile,
  listStoredMonths,
  readMonthTransactions,
  writeMonthTransactions,
} from './month-store.js'
import type { RecurrenceStore } from './recurrence-store.js'
import type { ThresholdsStore } from './thresholds-store.js'

/** Spreadsheets need the byte-order mark to read a UTF-8 CSV with accents. */
const UTF8_BOM = '\uFEFF'

export interface BackupStores {
  budgetStore: BudgetStore
  categoryStore: CategoryStore
  thresholdsStore: ThresholdsStore
  recurrenceStore: RecurrenceStore
}

export interface CsvImportReport {
  imported: number
  /** Rows the parser could not make sense of. */
  ignored: number
  months: number
  /** Categories met in the file that did not exist yet. */
  categories: number
}

/** Everything the app owns right now, read straight from disk. */
export function collectBackup(stores: BackupStores): BackupData {
  const months: Record<MonthKey, Transaction[]> = {}
  for (const month of listStoredMonths()) {
    const transactions = readMonthTransactions(month)
    if (transactions.length > 0) months[month] = transactions
  }

  return {
    categories: [...stores.categoryStore.categories],
    thresholds: stores.thresholdsStore.thresholds,
    recurrences: [...stores.recurrenceStore.recurrences],
    months,
  }
}

/** Writes a complete archive. Returns what it contains. */
export function exportBackup(filePath: string, stores: BackupStores): BackupCounts {
  const data = collectBackup(stores)
  writeFile(filePath, JSON.stringify(createArchive(data), null, 2))
  return countBackup(data)
}

/** Reads an archive without applying it — used to describe it before asking. */
export function readBackupFile(filePath: string): BackupData {
  let raw: unknown
  try {
    raw = JSON.parse(readFile(filePath))
  } catch {
    throw new Error('Fichier illisible : ce n’est pas un fichier JSON valide')
  }

  const data = parseBackupData(raw)
  if (!data) throw new Error('Ce fichier n’est pas une sauvegarde Budget valide')

  return data
}

/**
 * Applies an archive. Replacing makes the file the whole truth, months
 * included — the ones it does not mention are removed. Merging only adds what
 * is missing and never touches the thresholds already set.
 */
export function importBackup(data: BackupData, mode: ImportMode, stores: BackupStores): BackupCounts {
  if (mode === 'replace') {
    applyBackup(data, stores, true)
    return countBackup(data)
  }

  const { data: merged, added } = mergeBackups(collectBackup(stores), data)
  applyBackup(merged, stores, false)
  return added
}

/** Writes every transaction of every month, oldest first. Returns the row count. */
export function exportTransactionsCsv(filePath: string, stores: BackupStores): number {
  const transactions = Object.values(collectBackup(stores).months).flat()
  writeFile(filePath, UTF8_BOM + transactionsToCsv(transactions))
  return transactions.length
}

/**
 * Adds the rows of a CSV to the months their dates point at. Rows are always
 * added — never matched against what is already there — so importing the same
 * file twice doubles it; the dialog says as much.
 */
export function importTransactionsCsv(filePath: string, stores: BackupStores): CsvImportReport {
  const { transactions, ignored } = csvToTransactions(readFile(filePath))
  if (transactions.length === 0) {
    throw new Error('Aucune transaction lisible dans ce fichier')
  }

  const byMonth = new Map<MonthKey, Transaction[]>()
  for (const input of transactions) {
    const month = monthKeyOf(input.date)
    const bucket = byMonth.get(month)
    const transaction: Transaction = { id: createId(), ...input }
    if (bucket) bucket.push(transaction)
    else byMonth.set(month, [transaction])
  }

  for (const [month, rows] of byMonth) {
    writeMonthTransactions(month, [...readMonthTransactions(month), ...rows])
  }

  const categories = addMissingCategories(transactions, stores.categoryStore)
  stores.budgetStore.reload()

  return { imported: transactions.length, ignored, months: byMonth.size, categories }
}

function applyBackup(data: BackupData, stores: BackupStores, removeOtherMonths: boolean): void {
  stores.categoryStore.replaceAll(data.categories)
  stores.thresholdsStore.save(data.thresholds)
  stores.recurrenceStore.replaceAll(data.recurrences)

  if (removeOtherMonths) {
    const kept = new Set(Object.keys(data.months))
    for (const month of listStoredMonths()) {
      if (!kept.has(month)) deleteMonthFile(month)
    }
  }

  for (const [month, transactions] of Object.entries(data.months)) {
    writeMonthTransactions(month, transactions)
  }

  stores.budgetStore.reload()
}

/** Imported rows keep their category even when the app never heard of it. */
function addMissingCategories(
  transactions: readonly { category: string }[],
  store: CategoryStore,
): number {
  const known = new Set(store.categories.map((category) => category.name))
  const missing: Category[] = []

  for (const { category } of transactions) {
    if (category === '' || known.has(category)) continue
    known.add(category)
    missing.push({ name: category, icon: DEFAULT_CATEGORY_ICON })
  }

  if (missing.length > 0) store.replaceAll([...store.categories, ...missing])
  return missing.length
}

function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    throw new Error('Fichier illisible')
  }
}

function writeFile(filePath: string, contents: string): void {
  try {
    fs.writeFileSync(filePath, contents, 'utf-8')
  } catch {
    throw new Error('Écriture impossible : vérifiez le dossier choisi')
  }
}
