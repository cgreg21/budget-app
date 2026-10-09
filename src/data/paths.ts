/*
 * data/paths.ts — where the app keeps its data on disk.
 *
 * Everything lives under GLib's per-user data directory, e.g.
 * `~/.local/share/budget-app/` on Linux or `%LOCALAPPDATA%\budget-app\`
 * on Windows:
 *
 *   budget-app/
 *   ├── bank.json
 *   ├── categories.json
 *   ├── recurrences.json
 *   ├── thresholds.json
 *   └── months/
 *       ├── 2026-08.json
 *       └── 2026-09.json
 */
import GLib from 'gi:GLib-2.0'
import path from 'node:path'

import { isMonthKey, type MonthKey } from 'budget-lib'

const DATA_DIR_NAME = 'budget-app'
const MONTH_FILE_EXTENSION = '.json'

export const DATA_DIR = path.join(GLib.getUserDataDir(), DATA_DIR_NAME)

/** One JSON file per month, named after its month key. */
export const MONTHS_DIR = path.join(DATA_DIR, 'months')

export const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json')

/** The x / y / z amounts colouring the balance card. */
export const THRESHOLDS_FILE = path.join(DATA_DIR, 'thresholds.json')

/** Templates replayed into every month they are due in. */
export const RECURRENCES_FILE = path.join(DATA_DIR, 'recurrences.json')

/** Calendar settings and reconciliation baseline; never contains a password. */
export const CALENDAR_STATE_FILE = path.join(DATA_DIR, 'calendar.json')

/** Local display and application preferences. */
export const GENERAL_SETTINGS_FILE = path.join(DATA_DIR, 'general-settings.json')

/** The bank connection: settings, granted access, imported ids. Stays on this machine; never holds the key. */
export const BANK_STATE_FILE = path.join(DATA_DIR, 'bank.json')

/** Single-file layout used before the per-month split; migrated on startup. */
export const LEGACY_TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json')

export function monthFilePath(month: MonthKey): string {
  return path.join(MONTHS_DIR, `${month}${MONTH_FILE_EXTENSION}`)
}

/** The month a file in `months/` holds, or `null` if the name isn't one of ours. */
export function monthFromFileName(fileName: string): MonthKey | null {
  if (path.extname(fileName) !== MONTH_FILE_EXTENSION) return null
  const month = path.basename(fileName, MONTH_FILE_EXTENSION)
  return isMonthKey(month) ? month : null
}
