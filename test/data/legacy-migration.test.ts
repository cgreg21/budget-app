import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Transaction } from '../../src/domain/transaction.js'
import {
  createTempUserDataDir,
  readJson,
  removeTempUserDataDir,
  writeJson,
  writeText,
  type TempDataDir,
} from '../helpers/temp-data-dir.js'

type MigrationModule = typeof import('../../src/data/legacy-migration.js')
type PathsModule = typeof import('../../src/data/paths.js')

let temp: TempDataDir
let migrateLegacyTransactions: MigrationModule['migrateLegacyTransactions']
let paths: PathsModule

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  date: '2026-09-10',
  description: 'Course',
  category: 'Alimentation',
  kind: 'expense',
  amount: 45,
  ...overrides,
})

const monthFile = (month: string) => path.join(temp.monthsDir, `${month}.json`)

beforeEach(async () => {
  temp = createTempUserDataDir()
  paths = (await import('../../src/data/paths.js')) as PathsModule
  ;({ migrateLegacyTransactions } = (await import('../../src/data/legacy-migration.js')) as MigrationModule)
})

afterEach(() => {
  vi.restoreAllMocks()
  removeTempUserDataDir(temp)
})

describe('migrateLegacyTransactions', () => {
  it('does nothing when there is no legacy file', () => {
    expect(() => migrateLegacyTransactions()).not.toThrow()
    expect(fs.existsSync(temp.monthsDir)).toBe(false)
  })

  it('splits the legacy file into one file per month', () => {
    writeJson(paths.LEGACY_TRANSACTIONS_FILE, [
      transaction({ id: 'a', date: '2026-09-10' }),
      transaction({ id: 'b', date: '2026-08-02' }),
      transaction({ id: 'c', date: '2026-09-25' }),
    ])

    migrateLegacyTransactions()

    expect(readJson(monthFile('2026-08'))).toEqual([transaction({ id: 'b', date: '2026-08-02' })])
    expect(readJson(monthFile('2026-09'))).toEqual([
      transaction({ id: 'c', date: '2026-09-25' }),
      transaction({ id: 'a', date: '2026-09-10' }),
    ])
  })

  it('renames the legacy file rather than deleting it', () => {
    writeJson(paths.LEGACY_TRANSACTIONS_FILE, [transaction()])

    migrateLegacyTransactions()

    expect(fs.existsSync(paths.LEGACY_TRANSACTIONS_FILE)).toBe(false)
    expect(fs.existsSync(`${paths.LEGACY_TRANSACTIONS_FILE}.migrated`)).toBe(true)
  })

  it('runs only once: a second call finds nothing to do', () => {
    writeJson(paths.LEGACY_TRANSACTIONS_FILE, [transaction()])

    migrateLegacyTransactions()
    const after = readJson(monthFile('2026-09'))
    migrateLegacyTransactions()

    expect(readJson(monthFile('2026-09'))).toEqual(after)
  })

  it('never overwrites a month file that already exists', () => {
    writeJson(monthFile('2026-09'), [transaction({ id: 'existant' })])
    writeJson(paths.LEGACY_TRANSACTIONS_FILE, [transaction({ id: 'ancien' })])

    migrateLegacyTransactions()

    expect(readJson(monthFile('2026-09'))).toEqual([transaction({ id: 'existant' })])
  })

  it('leaves an unreadable legacy file alone', () => {
    writeText(paths.LEGACY_TRANSACTIONS_FILE, '{ broken')

    migrateLegacyTransactions()

    expect(fs.existsSync(paths.LEGACY_TRANSACTIONS_FILE)).toBe(true)
    expect(fs.existsSync(temp.monthsDir)).toBe(false)
  })

  it('leaves a legacy file that does not hold transactions alone', () => {
    writeJson(paths.LEGACY_TRANSACTIONS_FILE, { nope: true })

    migrateLegacyTransactions()

    expect(fs.existsSync(paths.LEGACY_TRANSACTIONS_FILE)).toBe(true)
  })

  it('leaves the legacy file in place when the split fails, so it is retried', () => {
    writeJson(paths.LEGACY_TRANSACTIONS_FILE, [transaction()])
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full')
    })

    expect(() => migrateLegacyTransactions()).not.toThrow()
    expect(fs.existsSync(paths.LEGACY_TRANSACTIONS_FILE)).toBe(true)
  })
})
