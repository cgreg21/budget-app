/*
 * data/paths.ts — where the app keeps its data on disk.
 *
 * Everything lives under GLib's per-user data directory, e.g.
 * `~/.local/share/budget-app/` on Linux or `%LOCALAPPDATA%\budget-app\`
 * on Windows:
 *
 *   budget-app/
 *   ├── categories.json
 *   ├── preferences.json
 *   ├── recurrences.json
 *   ├── remote.json
 *   ├── thresholds.json
 *   └── months/
 *       ├── 2026-08.json
 *       └── 2026-09.json
 *
 * When a remote server is configured, that directory becomes a cache of it
 * rather than the reference — see data/remote/remote-storage.ts.
 */
import GLib from 'gi:GLib-2.0'
import path from 'node:path'

import { isMonthKey, type MonthKey } from '../domain/month.js'

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

/** Interface state kept from one run to the next, e.g. the charts accordion. */
export const PREFERENCES_FILE = path.join(DATA_DIR, 'preferences.json')

/** Which server the budget is stored on, if any. Never holds the password. */
export const REMOTE_CONFIG_FILE = path.join(DATA_DIR, 'remote.json')

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
