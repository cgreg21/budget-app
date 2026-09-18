import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  formatDate,
  formatFrequency,
  formatMonth,
  formatMonthName,
  formatPercent,
  formatShortMonthName,
  formatSignedAmount,
} from '../../src/ui/format.js'

/** Intl uses a narrow no-break space as the thousands separator in fr-FR. */
const normalize = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ')

describe('formatAmount', () => {
  it('formats an amount as euros in the French locale', () => {
    expect(normalize(formatAmount(1200))).toBe('1 200,00 €')
  })

  it('keeps two decimals', () => {
    expect(normalize(formatAmount(45.5))).toBe('45,50 €')
  })

  it('formats zero', () => {
    expect(normalize(formatAmount(0))).toBe('0,00 €')
  })
})

describe('formatSignedAmount', () => {
  it('prefixes income with a plus sign', () => {
    expect(normalize(formatSignedAmount('income', 1200))).toBe('+ 1 200,00 €')
  })

  it('prefixes an expense with a true minus sign', () => {
    expect(normalize(formatSignedAmount('expense', 45))).toBe('− 45,00 €')
  })
})

describe('formatDate', () => {
  it('formats an ISO date in the French order', () => {
    expect(formatDate('2026-09-17')).toBe('17/09/2026')
  })

  it('returns the input untouched when it is not a date', () => {
    expect(formatDate('pas-une-date')).toBe('pas-une-date')
  })
})

describe('formatPercent', () => {
  it('rounds a ratio to a whole percentage', () => {
    expect(normalize(formatPercent(0.256))).toBe('26 %')
  })

  it('formats the extremes', () => {
    expect(normalize(formatPercent(0))).toBe('0 %')
    expect(normalize(formatPercent(1))).toBe('100 %')
  })
})

describe('formatMonth', () => {
  it('formats a month key with a capitalised month name', () => {
    expect(formatMonth('2026-09')).toBe('Septembre 2026')
  })

  it('returns the key untouched when it cannot be parsed', () => {
    expect(formatMonth('pas-un-mois')).toBe('pas-un-mois')
  })
})

describe('formatShortMonthName', () => {
  it('abbreviates and capitalises the month name', () => {
    expect(formatShortMonthName(1)).toMatch(/^Janv/)
    expect(formatShortMonthName(12)).toMatch(/^Déc/)
  })
})

describe('formatMonthName', () => {
  it('returns the full capitalised month name', () => {
    expect(formatMonthName(1)).toBe('Janvier')
    expect(formatMonthName(2)).toBe('Février')
    expect(formatMonthName(12)).toBe('Décembre')
  })
})

describe('formatFrequency', () => {
  it('labels every frequency in French', () => {
    expect(formatFrequency('monthly')).toBe('Mensuelle')
    expect(formatFrequency('quarterly')).toBe('Trimestrielle')
    expect(formatFrequency('yearly')).toBe('Annuelle')
  })
})
