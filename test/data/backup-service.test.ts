import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BACKUP_FORMAT, BACKUP_VERSION } from '../../src/domain/backup.js'
import { DEFAULT_BALANCE_THRESHOLDS } from '../../src/domain/balance.js'
import type { Transaction } from '../../src/domain/transaction.js'
import {
  createTempUserDataDir,
  removeTempUserDataDir,
  writeJson,
  writeText,
  type TempDataDir,
} from '../helpers/temp-data-dir.js'

type BackupModule = typeof import('../../src/data/backup-service.js')
type BudgetModule = typeof import('../../src/data/budget-store.js')
type CategoryModule = typeof import('../../src/data/category-store.js')
type RecurrenceModule = typeof import('../../src/data/recurrence-store.js')
type ThresholdsModule = typeof import('../../src/data/thresholds-store.js')

let temp: TempDataDir
let service: BackupModule
let stores: BackupModule extends never ? never : import('../../src/data/backup-service.js').BackupStores
const opened: { dispose(): void }[] = []

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
const outputFile = (name: string) => path.join(temp.root, name)

function track<T extends { dispose(): void }>(store: T): T {
  opened.push(store)
  return store
}

beforeEach(async () => {
  temp = createTempUserDataDir()
  vi.spyOn(fs, 'watch').mockImplementation((() => ({ close: () => {} }) as unknown as fs.FSWatcher) as unknown as typeof fs.watch)

  service = (await import('../../src/data/backup-service.js')) as BackupModule
  const { BudgetStore } = (await import('../../src/data/budget-store.js')) as BudgetModule
  const { CategoryStore } = (await import('../../src/data/category-store.js')) as CategoryModule
  const { RecurrenceStore } = (await import('../../src/data/recurrence-store.js')) as RecurrenceModule
  const { ThresholdsStore } = (await import('../../src/data/thresholds-store.js')) as ThresholdsModule

  const recurrenceStore = track(new RecurrenceStore())
  stores = {
    recurrenceStore,
    budgetStore: track(new BudgetStore(recurrenceStore)),
    categoryStore: track(new CategoryStore()),
    thresholdsStore: track(new ThresholdsStore()),
  }
})

afterEach(() => {
  for (const store of opened.splice(0)) store.dispose()
  vi.restoreAllMocks()
  removeTempUserDataDir(temp)
})

describe('collectBackup', () => {
  it('gathers the settings and every month that holds data', () => {
    writeJson(monthFile('2026-09'), [transaction()])
    writeJson(monthFile('2026-08'), [])

    const data = service.collectBackup(stores)

    expect(Object.keys(data.months)).toEqual(['2026-09'])
    expect(data.thresholds).toEqual(DEFAULT_BALANCE_THRESHOLDS)
    expect(data.categories.length).toBeGreaterThan(0)
    expect(data.recurrences).toEqual([])
  })
})

describe('exportBackup', () => {
  it('writes a self-describing archive and reports what it holds', () => {
    writeJson(monthFile('2026-09'), [transaction(), transaction({ id: 't2' })])
    const target = outputFile('backup.json')

    const counts = service.exportBackup(target, stores)
    const archive = JSON.parse(fs.readFileSync(target, 'utf-8'))

    expect(archive.format).toBe(BACKUP_FORMAT)
    expect(archive.version).toBe(BACKUP_VERSION)
    expect(counts).toMatchObject({ months: 1, transactions: 2, recurrences: 0 })
  })

  it('reports a readable error when the file cannot be written', () => {
    expect(() => service.exportBackup(path.join(temp.root, 'absent', 'backup.json'), stores)).toThrow(
      /Écriture impossible/,
    )
  })
})

describe('readBackupFile', () => {
  it('reads an archive back without applying it', () => {
    writeJson(monthFile('2026-09'), [transaction()])
    const target = outputFile('backup.json')
    service.exportBackup(target, stores)

    const data = service.readBackupFile(target)

    expect(data.months['2026-09']).toEqual([transaction()])
  })

  it('rejects a file that is not JSON', () => {
    const target = outputFile('broken.json')
    writeText(target, '{ broken')

    expect(() => service.readBackupFile(target)).toThrow(/pas un fichier JSON valide/)
  })

  it('rejects a file that is not one of ours', () => {
    const target = outputFile('other.json')
    writeJson(target, { hello: 'world' })

    expect(() => service.readBackupFile(target)).toThrow(/sauvegarde Budget valide/)
  })

  it('rejects a missing file', () => {
    expect(() => service.readBackupFile(outputFile('absent.json'))).toThrow(/pas un fichier JSON valide/)
  })
})

describe('importBackup', () => {
  it('replaces everything, removing the months the archive does not mention', () => {
    writeJson(monthFile('2026-09'), [transaction()])
    const target = outputFile('backup.json')
    service.exportBackup(target, stores)
    const data = service.readBackupFile(target)

    writeJson(monthFile('2026-10'), [transaction({ id: 'autre', date: '2026-10-01' })])
    stores.budgetStore.reload()

    const counts = service.importBackup(data, 'replace', stores)

    expect(fs.existsSync(monthFile('2026-10'))).toBe(false)
    expect(counts).toMatchObject({ months: 1, transactions: 1 })
  })

  it('applies the archive settings when replacing', () => {
    writeJson(monthFile('2026-09'), [transaction()])
    const target = outputFile('backup.json')
    service.exportBackup(target, stores)
    const data = service.readBackupFile(target)

    data.categories = [{ name: 'Unique', icon: 'folder-symbolic' }]
    data.thresholds = { low: -10, medium: 10, high: 20 }
    service.importBackup(data, 'replace', stores)

    expect(stores.categoryStore.categories).toEqual([{ name: 'Unique', icon: 'folder-symbolic' }])
    expect(stores.thresholdsStore.thresholds).toEqual({ low: -10, medium: 10, high: 20 })
  })

  it('merges without removing what is already there', () => {
    writeJson(monthFile('2026-09'), [transaction()])
    const target = outputFile('backup.json')
    service.exportBackup(target, stores)
    const data = service.readBackupFile(target)

    writeJson(monthFile('2026-10'), [transaction({ id: 'autre', date: '2026-10-01' })])
    stores.budgetStore.reload()

    const added = service.importBackup(data, 'merge', stores)

    expect(fs.existsSync(monthFile('2026-10'))).toBe(true)
    expect(added).toMatchObject({ months: 0, transactions: 0 })
  })

  it('adds only what the merge is missing', () => {
    const target = outputFile('backup.json')
    writeJson(monthFile('2026-09'), [transaction()])
    service.exportBackup(target, stores)
    const data = service.readBackupFile(target)

    fs.rmSync(monthFile('2026-09'))
    stores.budgetStore.reload()

    const added = service.importBackup(data, 'merge', stores)

    expect(added).toMatchObject({ months: 1, transactions: 1 })
  })
})

describe('exportTransactionsCsv', () => {
  it('writes every transaction and reports the row count', () => {
    writeJson(monthFile('2026-09'), [transaction()])
    writeJson(monthFile('2026-08'), [transaction({ id: 't2', date: '2026-08-02' })])
    const target = outputFile('export.csv')

    const count = service.exportTransactionsCsv(target, stores)
    const contents = fs.readFileSync(target, 'utf-8')

    expect(count).toBe(2)
    expect(contents.startsWith('\uFEFF')).toBe(true)
    expect(contents).toContain('Course')
  })
})

describe('importTransactionsCsv', () => {
  it('adds the rows to the months their dates point at', () => {
    const target = outputFile('import.csv')
    writeText(
      target,
      'Date;Description;Catégorie;Type;Montant\n2026-09-01;Loyer;Logement;Dépense;800\n2026-10-01;Loyer;Logement;Dépense;800\n',
    )

    const report = service.importTransactionsCsv(target, stores)

    expect(report).toMatchObject({ imported: 2, ignored: 0, months: 2 })
    expect(service.collectBackup(stores).months['2026-09']).toHaveLength(1)
  })

  it('keeps the rows already present in the month', () => {
    writeJson(monthFile('2026-09'), [transaction()])
    stores.budgetStore.reload()
    const target = outputFile('import.csv')
    writeText(target, '2026-09-01;Loyer;Logement;Dépense;800\n')

    service.importTransactionsCsv(target, stores)

    expect(service.collectBackup(stores).months['2026-09']).toHaveLength(2)
  })

  it('creates the categories the file introduces', () => {
    const target = outputFile('import.csv')
    writeText(target, '2026-09-01;Cours de piano;Musique;Dépense;60\n')

    const report = service.importTransactionsCsv(target, stores)

    expect(report.categories).toBe(1)
    expect(stores.categoryStore.categories.some((c) => c.name === 'Musique')).toBe(true)
  })

  it('does not recreate a category that already exists', () => {
    const target = outputFile('import.csv')
    writeText(target, '2026-09-01;Course;Alimentation;Dépense;45\n')

    expect(service.importTransactionsCsv(target, stores).categories).toBe(0)
  })

  it('counts a new category only once however many rows use it', () => {
    const target = outputFile('import.csv')
    writeText(target, '2026-09-01;A;Musique;Dépense;10\n2026-09-02;B;Musique;Dépense;20\n')

    expect(service.importTransactionsCsv(target, stores).categories).toBe(1)
  })

  it('reports the rows it could not read', () => {
    const target = outputFile('import.csv')
    writeText(target, 'Date;Description;Catégorie;Type;Montant\n2026-09-01;Loyer;Logement;Dépense;800\nn importe quoi\n')

    expect(service.importTransactionsCsv(target, stores).ignored).toBe(1)
  })

  it('refuses a file holding no readable transaction', () => {
    const target = outputFile('import.csv')
    writeText(target, 'rien du tout\n')

    expect(() => service.importTransactionsCsv(target, stores)).toThrow(/Aucune transaction lisible/)
  })

  it('reports a readable error when the file cannot be read', () => {
    expect(() => service.importTransactionsCsv(outputFile('absent.csv'), stores)).toThrow(
      /Fichier illisible/,
    )
  })

  it('round-trips an export back through the import', () => {
    writeJson(monthFile('2026-09'), [transaction()])
    const target = outputFile('roundtrip.csv')
    service.exportTransactionsCsv(target, stores)

    fs.rmSync(monthFile('2026-09'))
    stores.budgetStore.reload()

    const report = service.importTransactionsCsv(target, stores)

    expect(report.imported).toBe(1)
    expect(service.collectBackup(stores).months['2026-09']?.[0]).toMatchObject({
      description: 'Course',
      amount: 45,
      kind: 'expense',
    })
  })
})
