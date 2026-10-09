/*
 * Covers `bank.json`: what it accepts from disk and the two ways it differs
 * from the budget files — it is local to this machine, and a broken file never
 * blocks the application, it just starts a fresh connection state.
 */
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createTempUserDataDir,
  readJson,
  removeTempUserDataDir,
  writeJson,
  type TempDataDir,
} from '../../helpers/temp-data-dir.js'

type StoreModule = typeof import('../../../src/data/bank/bank-state-store.js')

let temp: TempDataDir
let stores: StoreModule
const opened: { dispose(): void }[] = []

beforeEach(async () => {
  temp = createTempUserDataDir()
  stores = await import('../../../src/data/bank/bank-state-store.js')
})

afterEach(() => {
  for (const store of opened.splice(0)) store.dispose()
  removeTempUserDataDir(temp)
})

const open = () => {
  const store = new stores.BankStateStore()
  opened.push(store)
  return store
}

describe('BankStateStore', () => {
  it('starts disconnected, importing from the first day of the month, with the loopback return address', () => {
    const { config, session, importedIds } = open().bank

    expect(session).toBeNull()
    expect(importedIds).toEqual([])
    expect(config.redirectUrl).toBe(stores.DEFAULT_BANK_REDIRECT_URL)
    expect(config.importFrom).toMatch(/^\d{4}-\d{2}-01$/)
  })

  it('saves to bank.json', () => {
    const store = open()
    store.save({ ...store.bank, lastImportAt: '2026-09-10T10:00:00.000Z', importedIds: ['a'] })

    expect(readJson(path.join(temp.dataDir, 'bank.json'))).toMatchObject({ importedIds: ['a'] })
    expect(open().bank.importedIds).toEqual(['a'])
  })

  it('falls back to a fresh state when the file is not a bank state', () => {
    writeJson(path.join(temp.dataDir, 'bank.json'), { nope: true })

    expect(open().bank.session).toBeNull()
  })
})
