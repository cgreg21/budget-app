/*
 * BudgetStore ties the month files, the recurrences and the selected month
 * together. Its directory watcher is stubbed here — as in the JsonFileStore
 * tests — so the debounced refresh can be driven without waiting on the OS.
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { currentMonthKey, FIRST_MONTH, LAST_MONTH } from '../../src/domain/month.js'
import type { Transaction, TransactionInput } from '../../src/domain/transaction.js'
import {
  createTempUserDataDir,
  removeTempUserDataDir,
  writeJson,
  type TempDataDir,
} from '../helpers/temp-data-dir.js'

type BudgetModule = typeof import('../../src/data/budget-store.js')
type RecurrenceModule = typeof import('../../src/data/recurrence-store.js')

type WatchListener = (eventType: string, fileName: string | null) => void

let temp: TempDataDir
let BudgetStore: BudgetModule['BudgetStore']
let RecurrenceStore: RecurrenceModule['RecurrenceStore']
const opened: { dispose(): void }[] = []
const watchers: { directory: string; listener: WatchListener }[] = []

const input = (overrides: Partial<TransactionInput> = {}): TransactionInput => ({
  date: '2026-09-10',
  description: 'Course',
  category: 'Alimentation',
  kind: 'expense',
  amount: 45,
  ...overrides,
})

const monthFile = (month: string) => path.join(temp.monthsDir, `${month}.json`)

function track<T extends { dispose(): void }>(store: T): T {
  opened.push(store)
  return store
}

/** A budget on an empty history, with no recurrence and September selected. */
function openBudget() {
  const recurrences = track(new RecurrenceStore())
  const budget = track(new BudgetStore(recurrences))
  budget.selectMonth('2026-09')
  return { budget, recurrences }
}

beforeEach(async () => {
  temp = createTempUserDataDir()
  watchers.length = 0
  // `fs.watch` is stubbed so the watcher callbacks can be invoked by hand:
  // the OS never has to deliver an event for the reload paths to be exercised.
  vi.spyOn(fs, 'watch').mockImplementation(((directory: unknown, listener: WatchListener) => {
    watchers.push({ directory: String(directory), listener })
    return { close: () => {} } as unknown as fs.FSWatcher
  }) as unknown as typeof fs.watch)
  ;({ BudgetStore } = (await import('../../src/data/budget-store.js')) as BudgetModule)
  ;({ RecurrenceStore } = (await import('../../src/data/recurrence-store.js')) as RecurrenceModule)
})

afterEach(() => {
  for (const store of opened.splice(0)) store.dispose()
  vi.restoreAllMocks()
  removeTempUserDataDir(temp)
})

describe('navigation', () => {
  it('starts on the current month', () => {
    const recurrences = track(new RecurrenceStore())
    const budget = track(new BudgetStore(recurrences))

    expect(budget.selectedMonth).toBe(currentMonthKey())
    expect(budget.currentMonth).toBe(currentMonthKey())
  })

  it('selects another month', () => {
    const { budget } = openBudget()
    budget.selectMonth('2026-01')

    expect(budget.selectedMonth).toBe('2026-01')
  })

  it('ignores a key that is not a month', () => {
    const { budget } = openBudget()
    budget.selectMonth('pas-un-mois')

    expect(budget.selectedMonth).toBe('2026-09')
  })

  it('clamps a month outside the navigable range', () => {
    const { budget } = openBudget()
    budget.selectMonth('1800-01')

    expect(budget.selectedMonth).toBe(FIRST_MONTH)
  })

  it('does not notify when the selected month is unchanged', () => {
    const { budget } = openBudget()
    const listener = vi.fn()
    budget.onChange(listener)

    budget.selectMonth('2026-09')

    expect(listener).not.toHaveBeenCalled()
  })

  it('steps to the previous and the next month', () => {
    const { budget } = openBudget()

    budget.selectOlderMonth()
    expect(budget.selectedMonth).toBe('2026-08')

    budget.selectNewerMonth()
    expect(budget.selectedMonth).toBe('2026-09')
  })

  it('reports whether older and newer months are reachable', () => {
    const { budget } = openBudget()
    expect(budget.hasOlderMonth).toBe(true)
    expect(budget.hasNewerMonth).toBe(true)

    budget.selectMonth(FIRST_MONTH)
    expect(budget.hasOlderMonth).toBe(false)

    budget.selectMonth(LAST_MONTH)
    expect(budget.hasNewerMonth).toBe(false)
  })

  it('notifies subscribers when the month changes', () => {
    const { budget } = openBudget()
    const listener = vi.fn()
    const unsubscribe = budget.onChange(listener)

    budget.selectMonth('2026-08')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    budget.selectMonth('2026-07')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('offers today as the default date on the current month', () => {
    const recurrences = track(new RecurrenceStore())
    const budget = track(new BudgetStore(recurrences))

    expect(budget.defaultTransactionDate.startsWith(currentMonthKey())).toBe(true)
  })

  it('offers the first day as the default date on another month', () => {
    const { budget } = openBudget()
    budget.selectMonth('2020-03')

    expect(budget.defaultTransactionDate).toBe('2020-03-01')
  })
})

describe('transactions', () => {
  it('starts with no transaction and empty totals', () => {
    const { budget } = openBudget()

    expect(budget.transactions).toEqual([])
    expect(budget.totals).toEqual({ income: 0, expense: 0, balance: 0 })
  })

  it('adds a transaction to the month of its date and shows that month', () => {
    const { budget } = openBudget()
    budget.add(input({ date: '2026-11-04' }))

    expect(budget.selectedMonth).toBe('2026-11')
    expect(budget.transactions).toHaveLength(1)
  })

  it('computes the totals of the selected month', () => {
    const { budget } = openBudget()
    budget.add(input({ kind: 'income', amount: 2000 }))
    budget.add(input({ kind: 'expense', amount: 500 }))

    expect(budget.totals).toEqual({ income: 2000, expense: 500, balance: 1500 })
  })

  it('updates a transaction of the selected month', () => {
    const { budget } = openBudget()
    budget.add(input())
    const id = budget.transactions[0]!.id

    budget.update(id, input({ description: 'Corrigé' }))

    expect(budget.transactions[0]?.description).toBe('Corrigé')
  })

  it('removes a transaction of the selected month', () => {
    const { budget } = openBudget()
    budget.add(input())

    budget.remove(budget.transactions[0]!.id)

    expect(budget.transactions).toEqual([])
  })

  it('lists the months that hold data, most recent first', () => {
    const { budget } = openBudget()
    budget.add(input({ date: '2026-09-10' }))
    budget.add(input({ date: '2026-11-10' }))

    expect(budget.monthsWithData).toEqual(['2026-11', '2026-09'])
  })
})

describe('recurrences', () => {
  it('fills the selected month with the occurrences it is missing', () => {
    const { budget, recurrences } = openBudget()
    recurrences.add({
      description: 'Loyer',
      category: 'Logement',
      kind: 'expense',
      amount: 800,
      day: 1,
      frequency: 'monthly',
      startMonth: '2026-01',
    })

    expect(budget.transactions).toHaveLength(1)
    expect(budget.transactions[0]).toMatchObject({ description: 'Loyer', date: '2026-09-01' })
  })

  it('does not fill a month the recurrence is not due in', () => {
    const { budget, recurrences } = openBudget()
    recurrences.add({
      description: 'Impôts',
      category: 'Autres',
      kind: 'expense',
      amount: 300,
      day: 15,
      frequency: 'yearly',
      startMonth: '2026-01',
    })

    expect(budget.transactions).toEqual([])
  })

  it('is idempotent: reopening a month adds nothing', () => {
    const { budget, recurrences } = openBudget()
    recurrences.add({
      description: 'Loyer',
      category: 'Logement',
      kind: 'expense',
      amount: 800,
      day: 1,
      frequency: 'monthly',
      startMonth: '2026-01',
    })

    budget.selectMonth('2026-08')
    budget.selectMonth('2026-09')

    expect(budget.transactions).toHaveLength(1)
  })

  it('adds a transaction together with the series it starts', () => {
    const { budget, recurrences } = openBudget()
    budget.addRecurring(input({ description: 'Loyer', date: '2026-09-01' }), { frequency: 'monthly' })

    expect(recurrences.recurrences).toHaveLength(1)
    expect(budget.transactions).toHaveLength(1)
    expect(budget.transactions[0]?.recurrenceId).toBe(recurrences.recurrences[0]?.id)
  })

  it('finds the series a transaction belongs to', () => {
    const { budget } = openBudget()
    budget.addRecurring(input({ date: '2026-09-01' }), { frequency: 'monthly' })

    expect(budget.recurrenceOf(budget.transactions[0]!)?.frequency).toBe('monthly')
  })

  it('returns no series for a one-off transaction', () => {
    const { budget } = openBudget()
    budget.add(input())

    expect(budget.recurrenceOf(budget.transactions[0]!)).toBeUndefined()
  })
})

describe('updateSeries', () => {
  it('creates a series for a transaction that had none', () => {
    const { budget, recurrences } = openBudget()
    budget.add(input({ date: '2026-09-05' }))
    const transaction = budget.transactions[0]!

    budget.updateSeries(transaction.id, { ...input({ date: '2026-09-05' }) }, { frequency: 'monthly' })

    expect(recurrences.recurrences).toHaveLength(1)
    expect(budget.transactions[0]?.recurrenceId).toBe(recurrences.recurrences[0]?.id)
  })

  it('keeps the day and the start month of an existing series', () => {
    const { budget, recurrences } = openBudget()
    budget.selectMonth('2026-01')
    budget.addRecurring(input({ date: '2026-01-31', description: 'Loyer' }), { frequency: 'monthly' })

    budget.selectMonth('2026-02')
    const occurrence = budget.transactions[0]!

    budget.updateSeries(
      occurrence.id,
      { ...occurrence, amount: 950, date: '2026-02-28' },
      { frequency: 'monthly' },
    )

    expect(recurrences.recurrences[0]).toMatchObject({
      amount: 950,
      day: 31,
      startMonth: '2026-01',
    })
  })

  it('drops the series when the transaction becomes one-off', () => {
    const { budget, recurrences } = openBudget()
    budget.addRecurring(input({ date: '2026-09-01' }), { frequency: 'monthly' })
    const transaction = budget.transactions[0]!

    budget.updateSeries(transaction.id, { ...transaction }, null)

    expect(recurrences.recurrences).toEqual([])
    expect(budget.transactions[0]?.recurrenceId).toBeUndefined()
  })

  it('leaves a one-off transaction one-off when no series is asked for', () => {
    const { budget, recurrences } = openBudget()
    budget.add(input())
    const transaction = budget.transactions[0]!

    budget.updateSeries(transaction.id, { ...transaction, amount: 12 }, null)

    expect(recurrences.recurrences).toEqual([])
    expect(budget.transactions[0]?.amount).toBe(12)
  })
})

describe('reload', () => {
  it('picks up month files rewritten behind its back', () => {
    const { budget } = openBudget()
    const external: Transaction[] = [{ id: 'x', ...input({ description: 'Importée' }) }]
    writeJson(monthFile('2026-09'), external)

    budget.reload()

    expect(budget.transactions).toEqual(external)
  })

  it('picks up months that disappeared', () => {
    const { budget } = openBudget()
    budget.add(input())
    expect(budget.monthsWithData).toEqual(['2026-09'])

    fs.rmSync(monthFile('2026-09'))
    budget.reload()

    expect(budget.monthsWithData).toEqual([])
    expect(budget.transactions).toEqual([])
  })

  it('notifies subscribers', () => {
    const { budget } = openBudget()
    const listener = vi.fn()
    budget.onChange(listener)

    budget.reload()

    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('dispose', () => {
  it('releases the stores and stops notifying', () => {
    const { budget } = openBudget()
    const listener = vi.fn()
    budget.onChange(listener)

    budget.dispose()
    budget.reload()

    expect(listener).not.toHaveBeenCalled()
  })

  it('can be called twice', () => {
    const { budget } = openBudget()
    budget.dispose()

    expect(() => budget.dispose()).not.toThrow()
  })
})

describe('caching of month stores', () => {
  it('reuses the store of a month it is already holding', () => {
    const { budget } = openBudget()
    budget.add(input())
    const id = budget.transactions[0]!.id

    budget.selectMonth('2026-08')
    budget.selectMonth('2026-09')

    expect(budget.transactions[0]?.id).toBe(id)
  })

  it('forgets a month it left behind empty', () => {
    const { budget } = openBudget()
    budget.selectMonth('2026-08')
    budget.selectMonth('2026-07')

    expect(fs.existsSync(monthFile('2026-08'))).toBe(false)
    expect(budget.transactions).toEqual([])
  })

  it('keeps a month that holds transactions', () => {
    const { budget } = openBudget()
    budget.add(input())
    budget.selectMonth('2026-08')

    expect(budget.monthsWithData).toEqual(['2026-09'])
  })
})

describe('the months directory watcher', () => {
  /** Delivers an event to every watcher and lets the debounce elapse. */
  const emit = (fileName: string | null) => {
    for (const { listener } of [...watchers]) listener('change', fileName)
    vi.advanceTimersByTime(300)
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('notices a month file created from outside', () => {
    const { budget } = openBudget()
    const listener = vi.fn()
    budget.onChange(listener)

    writeJson(monthFile('2026-05'), [{ id: 'x', ...input({ date: '2026-05-02' }) }])
    emit('2026-05.json')

    expect(budget.monthsWithData).toEqual(['2026-05'])
    expect(listener).toHaveBeenCalled()
  })

  it('notices a month whose file disappeared', () => {
    const { budget } = openBudget()
    budget.add(input())
    expect(budget.monthsWithData).toEqual(['2026-09'])

    fs.rmSync(monthFile('2026-09'))
    emit('2026-09.json')

    expect(budget.monthsWithData).toEqual([])
  })

  it('notices a month replaced by another one', () => {
    const { budget } = openBudget()
    writeJson(monthFile('2026-05'), [{ id: 'x', ...input({ date: '2026-05-02' }) }])
    emit('2026-05.json')

    fs.renameSync(monthFile('2026-05'), monthFile('2026-06'))
    emit('2026-06.json')

    expect(budget.monthsWithData).toEqual(['2026-06'])
  })

  it('ignores a file that is not a month file', () => {
    const { budget } = openBudget()
    const listener = vi.fn()
    budget.onChange(listener)

    writeJson(monthFile('2026-05'), [{ id: 'x', ...input({ date: '2026-05-02' }) }])
    emit('notes.txt')

    expect(listener).not.toHaveBeenCalled()
  })

  it('does not notify when the list of months is unchanged', () => {
    const { budget } = openBudget()
    const listener = vi.fn()
    budget.onChange(listener)

    emit(null)

    expect(listener).not.toHaveBeenCalled()
  })

  it('debounces a burst of events', () => {
    const { budget } = openBudget()
    const listener = vi.fn()
    budget.onChange(listener)

    writeJson(monthFile('2026-05'), [{ id: 'x', ...input({ date: '2026-05-02' }) }])
    for (const { listener: watcher } of [...watchers]) {
      watcher('change', '2026-05.json')
      watcher('change', '2026-05.json')
    }
    vi.advanceTimersByTime(300)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('notifies when the selected month changes on disk', () => {
    const { budget } = openBudget()
    budget.add(input())
    const listener = vi.fn()
    budget.onChange(listener)

    writeJson(monthFile('2026-09'), [{ id: 'y', ...input({ amount: 999 }) }])
    emit('2026-09.json')

    expect(budget.transactions[0]?.amount).toBe(999)
    expect(listener).toHaveBeenCalled()
  })

  it('stays quiet when a month other than the selected one changes', () => {
    const { budget } = openBudget()
    budget.add(input())
    budget.selectMonth('2026-10')

    const listener = vi.fn()
    budget.onChange(listener)

    writeJson(monthFile('2026-09'), [{ id: 'y', ...input({ amount: 999 }) }])
    emit('2026-09.json')

    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps working when the directory cannot be watched', () => {
    vi.spyOn(fs, 'watch').mockImplementation((() => {
      throw new Error('watching unavailable')
    }) as unknown as typeof fs.watch)

    const recurrences = track(new RecurrenceStore())
    const budget = track(new BudgetStore(recurrences))

    expect(() => budget.add(input())).not.toThrow()
    expect(budget.transactions).toHaveLength(1)
  })
})
