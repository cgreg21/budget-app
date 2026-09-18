/*
 * data/legacy-migration.ts — one-shot upgrade from the original single-file
 * layout (`transactions.json`) to the per-month history (`months/*.json`).
 *
 * The legacy file is split by transaction date; existing month files are
 * never overwritten. Once split, the old file is renamed rather than deleted,
 * so nothing is ever lost.
 */
import fs from 'node:fs'

import { groupByMonth } from '../domain/month.js'
import { isTransactionArray, sortByDateDesc } from '../domain/transaction.js'
import { LEGACY_TRANSACTIONS_FILE, MONTHS_DIR, monthFilePath } from './paths.js'

const MIGRATED_SUFFIX = '.migrated'

/** Runs at most once: after a successful split the source file no longer exists. */
export function migrateLegacyTransactions(): void {
  let raw: string
  try {
    raw = fs.readFileSync(LEGACY_TRANSACTIONS_FILE, 'utf-8')
  } catch {
    return // nothing to migrate — the normal case
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return // leave the unreadable file alone rather than risk losing it
  }
  if (!isTransactionArray(parsed)) return

  try {
    fs.mkdirSync(MONTHS_DIR, { recursive: true })
    for (const [month, transactions] of groupByMonth(parsed)) {
      const target = monthFilePath(month)
      if (fs.existsSync(target)) continue // already migrated, or newer data wins
      fs.writeFileSync(target, JSON.stringify(sortByDateDesc(transactions), null, 2), 'utf-8')
    }
    fs.renameSync(LEGACY_TRANSACTIONS_FILE, `${LEGACY_TRANSACTIONS_FILE}${MIGRATED_SUFFIX}`)
  } catch {
    // Migration will simply be retried on the next launch.
  }
}
