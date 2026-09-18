import { describe, expect, it } from 'vitest'
import {
  computeTotals,
  isTransactionArray,
  sortByDateDesc,
  sumByCategory,
  todayIsoDate,
  type Transaction,
} from '../../src/domain/transaction.js'

const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: '1',
  date: '2026-09-01',
  description: 'Test',
  category: 'Autres',
  kind: 'expense',
  amount: 10,
  ...overrides,
})

describe('isTransactionArray', () => {
  it('accepts a valid array', () => {
    expect(isTransactionArray([makeTransaction()])).toBe(true)
  })

  it('accepts an empty array', () => {
    expect(isTransactionArray([])).toBe(true)
  })

  it('rejects non-arrays', () => {
    expect(isTransactionArray({})).toBe(false)
    expect(isTransactionArray(null)).toBe(false)
  })

  it('rejects an array with a malformed entry', () => {
    expect(isTransactionArray([{ id: '1' }])).toBe(false)
  })

  it('rejects an array holding a non-object', () => {
    expect(isTransactionArray(['nope'])).toBe(false)
    expect(isTransactionArray([null])).toBe(false)
  })

  it.each([
    ['id', { id: 1 }],
    ['date', { date: 20260901 }],
    ['description', { description: null }],
    ['category', { category: 7 }],
    ['amount', { amount: '10' }],
    ['recurrenceId', { recurrenceId: 12 }],
  ])('rejects a wrong %s', (_field, override) => {
    expect(isTransactionArray([{ ...makeTransaction(), ...override }])).toBe(false)
  })

  it('rejects an invalid kind', () => {
    expect(isTransactionArray([makeTransaction({ kind: 'other' as never })])).toBe(false)
  })

  it('rejects a non-finite amount', () => {
    expect(isTransactionArray([makeTransaction({ amount: NaN })])).toBe(false)
  })

  it('accepts an optional recurrenceId', () => {
    expect(isTransactionArray([makeTransaction({ recurrenceId: 'r1' })])).toBe(true)
  })
})

describe('sortByDateDesc', () => {
  it('orders transactions from the most recent to the oldest', () => {
    const transactions = [
      makeTransaction({ id: '1', date: '2026-09-01' }),
      makeTransaction({ id: '2', date: '2026-09-30' }),
      makeTransaction({ id: '3', date: '2026-08-15' }),
    ]

    expect(sortByDateDesc(transactions).map((t) => t.id)).toEqual(['2', '1', '3'])
  })

  it('does not mutate the input array', () => {
    const transactions = [makeTransaction({ id: '1', date: '2026-09-01' }), makeTransaction({ id: '2', date: '2026-09-30' })]
    const original = [...transactions]
    sortByDateDesc(transactions)
    expect(transactions).toEqual(original)
  })
})

describe('computeTotals', () => {
  it('sums income and expense separately and computes the balance', () => {
    const transactions = [
      makeTransaction({ kind: 'income', amount: 1000 }),
      makeTransaction({ kind: 'expense', amount: 300 }),
      makeTransaction({ kind: 'expense', amount: 200 }),
    ]

    expect(computeTotals(transactions)).toEqual({ income: 1000, expense: 500, balance: 500 })
  })

  it('returns zeroes for an empty list', () => {
    expect(computeTotals([])).toEqual({ income: 0, expense: 0, balance: 0 })
  })
})

describe('sumByCategory', () => {
  it('sums amounts per category for the given kind, largest first', () => {
    const transactions = [
      makeTransaction({ kind: 'expense', category: 'Alimentation', amount: 50 }),
      makeTransaction({ kind: 'expense', category: 'Transport', amount: 100 }),
      makeTransaction({ kind: 'expense', category: 'Alimentation', amount: 30 }),
      makeTransaction({ kind: 'income', category: 'Salaire', amount: 2000 }),
    ]

    expect(sumByCategory(transactions, 'expense')).toEqual([
      { category: 'Transport', amount: 100 },
      { category: 'Alimentation', amount: 80 },
    ])
  })

  it('returns an empty array when no transaction matches the kind', () => {
    expect(sumByCategory([makeTransaction({ kind: 'income' })], 'expense')).toEqual([])
  })
})

describe('todayIsoDate', () => {
  it('returns an ISO date string', () => {
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
