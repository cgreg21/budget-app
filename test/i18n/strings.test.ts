/*
 * Exercises every function-valued entry of both translation tables — the
 * pluralisations, counts and interpolations that a plain data check cannot
 * reach — generically, so a new dynamic string cannot go untested, plus a few
 * explicit checks of the grammar.
 */
import { describe, expect, it } from 'vitest'

import { en } from '../../src/i18n/en.js'
import { fr } from '../../src/i18n/fr.js'
import type { Strings } from '../../src/i18n/strings.js'

type AnyFunction = (...args: never[]) => unknown

/** Every function in the dictionary with its dotted path. */
function collectFunctions(value: unknown, prefix = ''): { path: string; fn: AnyFunction }[] {
  if (typeof value === 'function') return [{ path: prefix, fn: value as AnyFunction }]
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, entry]) => collectFunctions(entry, prefix === '' ? key : `${prefix}.${key}`))
}

/** Representative arguments: numbers are tried at 0, 1 and many; everything else gets a tag. */
const NUMBER_SAMPLES = [0, 1, 7]
const ARGUMENT_SETS: Record<string, unknown[][]> = {
  'bankGroup.waitingForBank': [[true], [false]],
  'recurrenceDialog.defaultDescription': [['income'], ['expense']],
  'transactionDialog.defaultDescription': [['income'], ['expense']],
  'listTotal.countLabel': [[0, 0], [1, 1], [3, 12]],
}

function argumentSets(path: string, arity: number): unknown[][] {
  const explicit = ARGUMENT_SETS[path]
  if (explicit !== undefined) return explicit
  return NUMBER_SAMPLES.map((n) => Array.from({ length: arity }, (_, i) => (i === 0 ? n : `arg${i}`)))
}

describe.each([
  ['en', en],
  ['fr', fr],
] as const)('%s dynamic strings', (_locale, strings: Strings) => {
  const functions = collectFunctions(strings)

  it('exposes dynamic strings', () => {
    expect(functions.length).toBeGreaterThan(20)
  })

  it.each(functions.map(({ path, fn }) => [path, fn] as const))('%s returns a non-empty string', (path, fn) => {
    for (const args of argumentSets(path, fn.length)) {
      const result = fn(...(args as never[]))
      expect(typeof result).toBe('string')
      expect((result as string).trim()).not.toBe('')
      for (const arg of args) {
        if (typeof arg === 'string' && arg.startsWith('arg')) expect(result).toContain(arg)
      }
    }
  })
})

/** The strings whose first argument is a count and that must show it. */
const COUNT_STRINGS: ((strings: Strings) => (count: number) => string)[] = [
  (s) => s.dataGroup.monthsCount,
  (s) => s.dataGroup.transactionsCount,
  (s) => s.dataGroup.categoriesCount,
  (s) => s.dataGroup.recurrencesCount,
  (s) => s.dataGroup.transactionsExportedCount,
  (s) => s.dataGroup.transactionsImportedCount,
  (s) => s.dataGroup.categoriesCreatedCount,
  (s) => s.dataGroup.linesIgnoredCount,
  (s) => s.transactionFilters.categoriesCount,
  (s) => s.bankGroup.imported,
  (s) => (count) => s.listTotal.countLabel(count, count),
]

describe.each([
  ['en', en],
  ['fr', fr],
] as const)('%s counts', (_locale, strings: Strings) => {
  it.each(COUNT_STRINGS.map((pick, index) => [index, pick] as const))('count string #%i shows the number', (_index, pick) => {
    const fn = pick(strings)
    for (const count of [1, 2, 15]) expect(fn(count)).toContain(String(count))
  })
})

describe('English plurals', () => {
  it('uses the singular only at exactly one', () => {
    expect(en.dataGroup.transactionsCount(0)).toBe('0 transactions')
    expect(en.dataGroup.transactionsCount(1)).toBe('1 transaction')
    expect(en.dataGroup.transactionsCount(2)).toBe('2 transactions')
  })

  it('knows irregular plurals', () => {
    expect(en.dataGroup.categoriesCount(1)).toBe('1 category')
    expect(en.dataGroup.categoriesCount(3)).toBe('3 categories')
    expect(en.dataGroup.categoriesCreatedCount(2)).toBe('2 categories created')
    expect(en.transactionFilters.categoriesCount(1)).toBe('1 category')
  })

  it('counts months, recurrences and ignored lines', () => {
    expect(en.dataGroup.monthsCount(1)).toBe('1 month')
    expect(en.dataGroup.monthsCount(4)).toBe('4 months')
    expect(en.dataGroup.recurrencesCount(2)).toBe('2 recurrences')
    expect(en.dataGroup.linesIgnoredCount(1)).toBe('1 line ignored')
    expect(en.dataGroup.transactionsExportedCount(2)).toBe('2 transactions exported')
    expect(en.dataGroup.transactionsImportedCount(1)).toBe('1 transaction imported')
  })

  it('reports bank imports and connected accounts', () => {
    expect(en.bankGroup.imported(0)).toBe('Up to date: no new transaction')
    expect(en.bankGroup.imported(1)).toBe('1 transaction imported')
    expect(en.bankGroup.imported(5)).toBe('5 transactions imported')
    expect(en.bankGroup.connectedTo('Bank', 1)).toBe('Connected to Bank (1 account)')
    expect(en.bankGroup.connectedTo('Bank', 2)).toBe('Connected to Bank (2 accounts)')
  })

  it('describes the visible part of a list', () => {
    expect(en.listTotal.countLabel(3, 3)).toBe('3 transactions')
    expect(en.listTotal.countLabel(1, 3)).toBe('1 transaction out of 3')
  })

  it('names the kind of a new transaction', () => {
    expect(en.transactionDialog.defaultDescription('income')).toBe('Income')
    expect(en.transactionDialog.defaultDescription('expense')).toBe('Expense')
    expect(en.recurrenceDialog.defaultDescription('income')).toBe('Recurring income')
    expect(en.recurrenceDialog.defaultDescription('expense')).toBe('Recurring expense')
  })

  it('interpolates names, dates and messages', () => {
    expect(en.confirmDeleteDialog.heading('Rent')).toBe('Delete "Rent"?')
    expect(en.calendarGroup.lastSync('2026-10-09', '12:30')).toBe('Last successful sync: 2026-10-09 at 12:30')
    expect(en.calendarGroup.serverError(503)).toBe('The calendar server returned HTTP 503.')
    expect(en.format.recurrenceRange('Sep 2026', 'Aug 2027', 12)).toBe('Sep 2026 → Aug 2027 (12 times)')
    expect(en.bankGroup.waitingForBank(true)).toMatch(/imported when you come back/)
    expect(en.bankGroup.waitingForBank(false)).toMatch(/paste the address/)
    expect(en.dataGroup.csvImportSummary('3 transactions imported', '2 months')).toBe('3 transactions imported across 2 months')
  })
})

describe('French plurals', () => {
  it('adds an "s" past the first', () => {
    expect(fr.dataGroup.transactionsCount(0)).toBe('0 transaction')
    expect(fr.dataGroup.transactionsCount(1)).toBe('1 transaction')
    expect(fr.dataGroup.transactionsCount(2)).toBe('2 transactions')
    expect(fr.dataGroup.categoriesCount(3)).toBe('3 catégories')
    expect(fr.dataGroup.recurrencesCount(1)).toBe('1 récurrence')
  })

  it('agrees the participle with the count', () => {
    expect(fr.dataGroup.transactionsExportedCount(1)).toBe('1 transaction exportée')
    expect(fr.dataGroup.transactionsExportedCount(2)).toBe('2 transactions exportées')
    expect(fr.dataGroup.transactionsImportedCount(1)).toBe('1 transaction importée')
    expect(fr.dataGroup.transactionsImportedCount(3)).toBe('3 transactions importées')
    expect(fr.dataGroup.categoriesCreatedCount(1)).toBe('1 catégorie créée')
    expect(fr.dataGroup.categoriesCreatedCount(2)).toBe('2 catégories créées')
    expect(fr.dataGroup.linesIgnoredCount(1)).toBe('1 ligne ignorée')
    expect(fr.dataGroup.linesIgnoredCount(4)).toBe('4 lignes ignorées')
  })

  it('leaves "mois" invariable', () => {
    expect(fr.dataGroup.monthsCount(1)).toBe('1 mois')
    expect(fr.dataGroup.monthsCount(6)).toBe('6 mois')
  })

  it('reports bank imports and connected accounts', () => {
    expect(fr.bankGroup.imported(0)).toBe('À jour : aucune nouvelle transaction')
    expect(fr.bankGroup.imported(1)).toBe('1 transaction importée')
    expect(fr.bankGroup.imported(5)).toBe('5 transactions importées')
    expect(fr.bankGroup.connectedTo('Banque', 1)).toBe('Connecté à Banque (1 compte)')
    expect(fr.bankGroup.connectedTo('Banque', 2)).toBe('Connecté à Banque (2 comptes)')
  })

  it('describes the visible part of a list', () => {
    expect(fr.listTotal.countLabel(3, 3)).toBe('3 transactions')
    expect(fr.listTotal.countLabel(1, 3)).toBe('1 transaction sur 3')
  })

  it('names the kind of a new transaction', () => {
    expect(fr.transactionDialog.defaultDescription('income')).toBe('Revenu')
    expect(fr.transactionDialog.defaultDescription('expense')).toBe('Dépense')
    expect(fr.recurrenceDialog.defaultDescription('income')).toBe('Revenu récurrent')
    expect(fr.recurrenceDialog.defaultDescription('expense')).toBe('Dépense récurrente')
  })

  it('interpolates names, dates and messages', () => {
    expect(fr.confirmDeleteDialog.heading('Loyer')).toBe('Supprimer « Loyer » ?')
    expect(fr.calendarGroup.lastSync('09/10/2026', '12:30')).toBe('Dernière synchronisation réussie : 09/10/2026 à 12:30')
    expect(fr.calendarGroup.serverError(503)).toBe('Le serveur du calendrier a répondu HTTP 503.')
    expect(fr.format.recurrenceRange('Sept. 2026', 'Août 2027', 12)).toBe('Sept. 2026 → Août 2027 (12 fois)')
    expect(fr.bankGroup.waitingForBank(true)).toMatch(/importées à votre retour/)
    expect(fr.bankGroup.waitingForBank(false)).toMatch(/collez ci-dessous/)
    expect(fr.transactionFilters.categoriesCount(2)).toBe('2 catégories')
  })
})

describe('both dictionaries', () => {
  it('offer the same dynamic strings', () => {
    const paths = (strings: Strings) => collectFunctions(strings).map(({ path }) => path).sort()
    expect(paths(fr)).toEqual(paths(en))
  })
})
