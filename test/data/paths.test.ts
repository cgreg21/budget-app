import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTempUserDataDir, removeTempUserDataDir, type TempDataDir } from '../helpers/temp-data-dir.js'

type PathsModule = typeof import('../../src/data/paths.js')

let temp: TempDataDir
let paths: PathsModule

beforeEach(async () => {
  temp = createTempUserDataDir()
  paths = await import('../../src/data/paths.js')
})

afterEach(() => {
  removeTempUserDataDir(temp)
})

describe('data directory layout', () => {
  it('nests everything under the per-user data directory', () => {
    expect(paths.DATA_DIR).toBe(temp.dataDir)
    expect(paths.MONTHS_DIR).toBe(path.join(temp.dataDir, 'months'))
  })

  it('names each settings file after what it holds', () => {
    expect(paths.CATEGORIES_FILE).toBe(path.join(temp.dataDir, 'categories.json'))
    expect(paths.THRESHOLDS_FILE).toBe(path.join(temp.dataDir, 'thresholds.json'))
    expect(paths.RECURRENCES_FILE).toBe(path.join(temp.dataDir, 'recurrences.json'))
    expect(paths.REMOTE_CONFIG_FILE).toBe(path.join(temp.dataDir, 'remote.json'))
    expect(paths.LEGACY_TRANSACTIONS_FILE).toBe(path.join(temp.dataDir, 'transactions.json'))
  })
})

describe('monthFilePath', () => {
  it('names a month file after its month key', () => {
    expect(paths.monthFilePath('2026-09')).toBe(path.join(temp.monthsDir, '2026-09.json'))
  })
})

describe('monthFromFileName', () => {
  it('reads the month back from a file name', () => {
    expect(paths.monthFromFileName('2026-09.json')).toBe('2026-09')
  })

  it('rejects a file with another extension', () => {
    expect(paths.monthFromFileName('2026-09.txt')).toBeNull()
  })

  it('rejects a file whose name is not a month key', () => {
    expect(paths.monthFromFileName('notes.json')).toBeNull()
    expect(paths.monthFromFileName('2026-13.json')).toBeNull()
  })

  it('round-trips with monthFilePath', () => {
    expect(paths.monthFromFileName(path.basename(paths.monthFilePath('2026-01')))).toBe('2026-01')
  })
})

describe('createId', () => {
  it('produces a distinct identifier on every call', async () => {
    const { createId } = await import('../../src/data/id.js')
    const ids = new Set(Array.from({ length: 100 }, () => createId()))

    expect(ids.size).toBe(100)
    for (const id of ids) expect(typeof id).toBe('string')
  })
})
