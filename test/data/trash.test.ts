import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Transaction } from 'budget-lib'
import {
  createTempUserDataDir,
  readJson,
  removeTempUserDataDir,
  writeJson,
  type TempDataDir,
} from '../helpers/temp-data-dir.js'

type TrashModule = typeof import('../../src/data/trash-store.js')
type BudgetModule = typeof import('../../src/data/budget-store.js')
type RecurrenceModule = typeof import('../../src/data/recurrence-store.js')
type PathsModule = typeof import('../../src/data/paths.js')

let temp: TempDataDir
let TrashStore: TrashModule['TrashStore']
let BudgetStore: BudgetModule['BudgetStore']
let RecurrenceStore: RecurrenceModule['RecurrenceStore']
let trashFile: string
const opened: { dispose(): void }[] = []

const track = <T extends { dispose(): void }>(store: T): T => {
  opened.push(store)
  return store
}

const tx = (id: string, overrides: Partial<Transaction> = {}): Transaction => ({
  id,
  date: '2026-09-10',
  description: id,
  category: 'Alimentation',
  kind: 'expense',
  amount: 10,
  ...overrides,
})

beforeEach(async () => {
  temp = createTempUserDataDir()
  ;({ TrashStore } = (await import('../../src/data/trash-store.js')) as TrashModule)
  ;({ BudgetStore } = (await import('../../src/data/budget-store.js')) as BudgetModule)
  ;({ RecurrenceStore } = (await import('../../src/data/recurrence-store.js')) as RecurrenceModule)
  ;({ TRASH_FILE: trashFile } = (await import('../../src/data/paths.js')) as PathsModule)
})

afterEach(() => {
  for (const store of opened.splice(0)) store.dispose()
  removeTempUserDataDir(temp)
})

describe('TrashStore', () => {
  it('starts empty and ignores an invalid file', () => {
    writeJson(trashFile, [{ id: 'x' }])
    expect(track(new TrashStore()).items).toEqual([])
  })

  it('adds with a deletion date, most recent first, and persists', () => {
    const store = track(new TrashStore())
    store.add([tx('a')], '2026-09-01T10:00:00.000Z')
    store.add([tx('b'), tx('c')], '2026-09-02T10:00:00.000Z')
    expect(store.items.map((item) => item.id)).toEqual(['b', 'c', 'a'])
    expect(store.items[0]!.deletedAt).toBe('2026-09-02T10:00:00.000Z')
    expect(readJson(trashFile)).toHaveLength(3)
  })

  it('replaces an entry that shares an id and ignores empty additions', () => {
    const store = track(new TrashStore())
    store.add([tx('a', { amount: 1 })], '2026-09-01T10:00:00.000Z')
    store.add([tx('a', { amount: 2 })], '2026-09-02T10:00:00.000Z')
    store.add([])
    expect(store.items).toHaveLength(1)
    expect(store.items[0]!.amount).toBe(2)
  })

  it('takes entries back as plain transactions', () => {
    const store = track(new TrashStore())
    store.add([tx('a'), tx('b')])
    const taken = store.take(['a', 'zzz'])
    expect(taken).toEqual([tx('a')])
    expect('deletedAt' in taken[0]!).toBe(false)
    expect(store.items.map((item) => item.id)).toEqual(['b'])
    expect(store.take(['zzz'])).toEqual([])
  })

  it('removes for good and empties', () => {
    const store = track(new TrashStore())
    store.add([tx('a'), tx('b'), tx('c')])
    expect(store.remove(['a', 'b', 'nope'])).toBe(2)
    expect(store.empty()).toBe(1)
    expect(store.empty()).toBe(0)
    expect(store.items).toEqual([])
  })

  it('applies calendar outcomes', () => {
    const store = track(new TrashStore())
    store.add([tx('a'), tx('b')], '2026-09-01T10:00:00.000Z')
    store.applyCalendar([], [])
    store.applyCalendar([{ ...tx('c'), deletedAt: '2026-09-03T10:00:00.000Z' }], ['a'])
    expect(store.items.map((item) => item.id)).toEqual(['c', 'b'])
  })
})

describe('BudgetStore trash and bulk operations', () => {
  function openBudget() {
    const budget = track(new BudgetStore(track(new RecurrenceStore())))
    budget.selectMonth('2026-09')
    return budget
  }

  const addAll = (budget: InstanceType<BudgetModule['BudgetStore']>) => {
    for (const [description, category] of [['a', 'Alimentation'], ['b', 'Alimentation'], ['c', 'Loisirs']] as const) {
      budget.add({ date: '2026-09-10', description, category, kind: 'expense', amount: 5 })
    }
    return budget.transactions.map((transaction) => transaction.id)
  }

  it('moves a deleted transaction to the trash and restores it', () => {
    const budget = openBudget()
    const [first] = addAll(budget)
    budget.remove(first!)
    expect(budget.transactions).toHaveLength(2)
    expect(budget.trash.map((item) => item.id)).toEqual([first])

    expect(budget.restore([first!])).toBe(1)
    expect(budget.transactions).toHaveLength(3)
    expect(budget.trash).toEqual([])
  })

  it('deletes several transactions at once and notifies the trash listeners', () => {
    const budget = openBudget()
    const ids = addAll(budget)
    let notified = 0
    budget.onTrashChange(() => { notified++ })
    expect(budget.removeMany([ids[0]!, ids[1]!, 'unknown'])).toBe(2)
    expect(notified).toBe(1)
    expect(budget.transactions).toHaveLength(1)
    expect(budget.removeMany([])).toBe(0)
  })

  it('restores into the month of the date without changing the month on screen', () => {
    const budget = openBudget()
    const [first] = addAll(budget)
    budget.remove(first!)
    budget.selectMonth('2026-10')
    expect(budget.restore([first!])).toBe(1)
    expect(budget.selectedMonth).toBe('2026-10')
    budget.selectMonth('2026-09')
    expect(budget.transactions.map((transaction) => transaction.id)).toContain(first)
  })

  it('deletes forever and empties the trash', () => {
    const budget = openBudget()
    const ids = addAll(budget)
    budget.removeMany(ids)
    expect(budget.deleteForever([ids[0]!])).toBe(1)
    expect(budget.trash).toHaveLength(2)
    expect(budget.emptyTrash()).toBe(2)
    expect(budget.trash).toEqual([])
  })

  it('changes the category of several transactions at once', () => {
    const budget = openBudget()
    const ids = addAll(budget)
    expect(budget.changeCategory(ids, 'Loisirs')).toBe(2)
    expect(budget.transactions.every((transaction) => transaction.category === 'Loisirs')).toBe(true)
    expect(budget.changeCategory(ids, 'Loisirs')).toBe(0)
  })

  it('moves a transaction edited into another month', () => {
    const budget = openBudget()
    const [first] = addAll(budget)
    budget.update(first!, { date: '2026-10-02', description: 'a', category: 'Alimentation', kind: 'expense', amount: 5 })
    expect(budget.selectedMonth).toBe('2026-10')
    expect(budget.transactions.map((transaction) => transaction.id)).toEqual([first])
  })

  it('applies calendar trash outcomes', () => {
    const budget = openBudget()
    const [first] = addAll(budget)
    budget.remove(first!)
    budget.applyCalendarTrash([{ ...tx('z'), deletedAt: '2030-01-01T00:00:00.000Z' }], [first!])
    expect(budget.trash.map((item) => item.id)).toEqual(['z'])
  })
})
