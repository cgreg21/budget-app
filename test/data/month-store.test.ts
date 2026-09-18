import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Transaction, TransactionInput } from '../../src/domain/transaction.js'
import {
  createTempUserDataDir,
  readJson,
  removeTempUserDataDir,
  writeJson,
  writeText,
  type TempDataDir,
} from '../helpers/temp-data-dir.js'

type StoreModule = typeof import('../../src/data/month-store.js')

let temp: TempDataDir
let store: StoreModule
const opened: { dispose(): void }[] = []

const input = (overrides: Partial<TransactionInput> = {}): TransactionInput => ({
  date: '2026-09-10',
  description: 'Course',
  category: 'Alimentation',
  kind: 'expense',
  amount: 45,
  ...overrides,
})

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  ...input(),
  ...overrides,
})

function monthFile(month: string): string {
  return path.join(temp.monthsDir, `${month}.json`)
}

function openMonth(month: string) {
  const instance = new store.MonthStore(month)
  opened.push(instance)
  return instance
}

beforeEach(async () => {
  temp = createTempUserDataDir()
  store = (await import('../../src/data/month-store.js')) as StoreModule
})

afterEach(() => {
  for (const instance of opened.splice(0)) instance.dispose()
  removeTempUserDataDir(temp)
})

describe('listStoredMonths', () => {
  it('returns an empty list when no history exists', () => {
    expect(store.listStoredMonths()).toEqual([])
  })

  it('lists the months that have a file, most recent first', () => {
    writeJson(monthFile('2026-01'), [])
    writeJson(monthFile('2026-09'), [])
    writeJson(monthFile('2025-12'), [])

    expect(store.listStoredMonths()).toEqual(['2026-09', '2026-01', '2025-12'])
  })

  it('ignores files that are not month files', () => {
    writeJson(monthFile('2026-09'), [])
    writeText(path.join(temp.monthsDir, 'notes.txt'), 'hello')
    writeJson(path.join(temp.monthsDir, 'autre.json'), [])

    expect(store.listStoredMonths()).toEqual(['2026-09'])
  })
})

describe('readMonthTransactions', () => {
  it('returns an empty list when the month has no file', () => {
    expect(store.readMonthTransactions('2026-09')).toEqual([])
  })

  it('reads the transactions of a month', () => {
    writeJson(monthFile('2026-09'), [transaction()])
    expect(store.readMonthTransactions('2026-09')).toEqual([transaction()])
  })

  it('returns an empty list when the file is not valid JSON', () => {
    writeText(monthFile('2026-09'), '{ broken')
    expect(store.readMonthTransactions('2026-09')).toEqual([])
  })

  it('returns an empty list when the contents are not transactions', () => {
    writeJson(monthFile('2026-09'), [{ nope: true }])
    expect(store.readMonthTransactions('2026-09')).toEqual([])
  })
})

describe('writeMonthTransactions', () => {
  it('creates the months directory and writes the file sorted', () => {
    store.writeMonthTransactions('2026-09', [
      transaction({ id: 'a', date: '2026-09-01' }),
      transaction({ id: 'b', date: '2026-09-20' }),
    ])

    expect(readJson(monthFile('2026-09'))).toEqual([
      transaction({ id: 'b', date: '2026-09-20' }),
      transaction({ id: 'a', date: '2026-09-01' }),
    ])
  })

  it('overwrites what was already there', () => {
    store.writeMonthTransactions('2026-09', [transaction({ id: 'a' })])
    store.writeMonthTransactions('2026-09', [transaction({ id: 'b' })])

    expect(store.readMonthTransactions('2026-09')).toEqual([transaction({ id: 'b' })])
  })
})

describe('deleteMonthFile', () => {
  it('removes the file of a month', () => {
    store.writeMonthTransactions('2026-09', [transaction()])
    store.deleteMonthFile('2026-09')

    expect(fs.existsSync(monthFile('2026-09'))).toBe(false)
  })

  it('stays silent when the file is already gone', () => {
    expect(() => store.deleteMonthFile('2026-09')).not.toThrow()
  })
})

describe('MonthStore', () => {
  it('remembers the month it was opened for', () => {
    expect(openMonth('2026-09').month).toBe('2026-09')
  })

  it('starts empty when the month has no file', () => {
    expect(openMonth('2026-09').transactions).toEqual([])
  })

  it('loads the transactions already stored, most recent first', () => {
    writeJson(monthFile('2026-09'), [
      transaction({ id: 'a', date: '2026-09-01' }),
      transaction({ id: 'b', date: '2026-09-20' }),
    ])

    expect(openMonth('2026-09').transactions.map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('starts empty when the file holds something else', () => {
    writeJson(monthFile('2026-09'), { nope: true })
    expect(openMonth('2026-09').transactions).toEqual([])
  })

  it('assigns an id when a transaction is added', () => {
    const month = openMonth('2026-09')
    month.add(input())

    expect(month.transactions).toHaveLength(1)
    expect(month.transactions[0]?.id).toBeTypeOf('string')
    expect(month.transactions[0]?.description).toBe('Course')
  })

  it('adds several transactions at once', () => {
    const month = openMonth('2026-09')
    month.addMany([input({ description: 'A' }), input({ description: 'B' })])

    expect(month.transactions).toHaveLength(2)
  })

  it('gives each added transaction a distinct id', () => {
    const month = openMonth('2026-09')
    month.addMany([input({ description: 'A' }), input({ description: 'B' })])

    const ids = new Set(month.transactions.map((t) => t.id))
    expect(ids.size).toBe(2)
  })

  it('does nothing when asked to add an empty list', () => {
    const month = openMonth('2026-09')
    month.addMany([])

    expect(month.transactions).toEqual([])
    expect(fs.existsSync(monthFile('2026-09'))).toBe(false)
  })

  it('keeps the transactions sorted after an add', () => {
    const month = openMonth('2026-09')
    month.add(input({ date: '2026-09-01' }))
    month.add(input({ date: '2026-09-25' }))

    expect(month.transactions.map((t) => t.date)).toEqual(['2026-09-25', '2026-09-01'])
  })

  it('updates a transaction while keeping its id', () => {
    const month = openMonth('2026-09')
    month.add(input())
    const id = month.transactions[0]!.id

    month.update(id, input({ description: 'Corrigé', amount: 60 }))

    expect(month.transactions[0]).toMatchObject({ id, description: 'Corrigé', amount: 60 })
  })

  it('ignores an update for an unknown id', () => {
    const month = openMonth('2026-09')
    month.add(input())
    const before = [...month.transactions]

    month.update('inconnu', input({ description: 'Corrigé' }))

    expect(month.transactions).toEqual(before)
  })

  it('leaves the other transactions of the month alone', () => {
    const month = openMonth('2026-09')
    month.addMany([input({ description: 'A' }), input({ description: 'B' })])
    const untouched = month.transactions.find((t) => t.description === 'B')!

    month.update(month.transactions.find((t) => t.description === 'A')!.id, input({ description: 'A2' }))

    expect(month.transactions).toContainEqual(untouched)
  })

  it('removes a transaction', () => {
    const month = openMonth('2026-09')
    month.add(input())
    month.remove(month.transactions[0]!.id)

    expect(month.transactions).toEqual([])
  })

  it('ignores a removal for an unknown id', () => {
    const month = openMonth('2026-09')
    month.add(input())

    month.remove('inconnu')

    expect(month.transactions).toHaveLength(1)
  })

  it('persists its changes to the month file', () => {
    const month = openMonth('2026-09')
    month.add(input())

    expect(store.readMonthTransactions('2026-09')).toHaveLength(1)
  })

  it('notifies subscribers when it changes', () => {
    const month = openMonth('2026-09')
    let notified = 0
    month.onChange(() => {
      notified += 1
    })

    month.add(input())

    expect(notified).toBe(1)
  })
})
