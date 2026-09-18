import { describe, expect, it } from 'vitest'

import type { Recurrence } from '../../src/domain/recurrence.js'
import {
  describeRemoteStatus,
  formatAmount,
  formatDate,
  formatFrequency,
  formatMonth,
  formatMonthName,
  formatPercent,
  formatRecurrencePeriod,
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

describe('formatRecurrencePeriod', () => {
  const series: Recurrence = {
    id: 'r1',
    description: 'Loyer',
    category: 'Logement',
    kind: 'expense',
    amount: 800,
    day: 5,
    frequency: 'monthly',
    startMonth: '2026-09',
  }

  it('announces an open-ended series by its start', () => {
    expect(formatRecurrencePeriod(series)).toBe('à partir de Septembre 2026')
  })

  it('spells out the span of a limited series', () => {
    expect(formatRecurrencePeriod({ ...series, occurrences: 12 }))
      .toBe('Septembre 2026 → Août 2027 (12 fois)')
  })

  it('counts a quarterly series in quarters', () => {
    expect(formatRecurrencePeriod({ ...series, frequency: 'quarterly', occurrences: 4 }))
      .toBe('Septembre 2026 → Juin 2027 (4 fois)')
  })

  it('reduces a single occurrence to its own month', () => {
    expect(formatRecurrencePeriod({ ...series, occurrences: 1 }))
      .toBe('Septembre 2026 → Septembre 2026 (1 fois)')
  })
})

describe('describeRemoteStatus', () => {
  it('names the local case', () => {
    expect(describeRemoteStatus({ state: 'disabled' })).toBe('Stockage local — aucun serveur configuré')
  })

  it('names the transient case', () => {
    expect(describeRemoteStatus({ state: 'connecting' })).toBe('Connexion au serveur…')
  })

  it('reports the read-only case', () => {
    expect(describeRemoteStatus({ state: 'offline' })).toBe('Hors ligne — budget en lecture seule')
  })

  it('repeats the server message when there is one', () => {
    expect(describeRemoteStatus({ state: 'error', message: 'identifiants refusés' }))
      .toBe('identifiants refusés')
  })

  it('falls back to a generic message when the error has none', () => {
    expect(describeRemoteStatus({ state: 'error' })).toBe('Erreur de connexion')
  })

  it('mentions the last synchronisation when one happened', () => {
    const described = describeRemoteStatus({
      state: 'online',
      lastSyncedAt: '2026-09-18T08:30:00.000Z',
    })
    expect(described).toMatch(/^Connecté — dernière synchronisation à \d{2}:\d{2}$/)
  })

  it('stays terse before the first synchronisation', () => {
    expect(describeRemoteStatus({ state: 'online' })).toBe('Connecté')
  })

  it('shows an unparsable timestamp as it came', () => {
    expect(describeRemoteStatus({ state: 'online', lastSyncedAt: 'plus tard' }))
      .toBe('Connecté — dernière synchronisation à plus tard')
  })
})

describe('in English (BUDGET_APP_LOCALE=en)', () => {
  const withEnglish = (run: () => void) => {
    const previous = process.env.BUDGET_APP_LOCALE
    process.env.BUDGET_APP_LOCALE = 'en'
    try {
      run()
    } finally {
      if (previous === undefined) delete process.env.BUDGET_APP_LOCALE
      else process.env.BUDGET_APP_LOCALE = previous
    }
  }

  it('formats amounts, dates and month names in English while keeping euros', () => {
    withEnglish(() => {
      expect(normalize(formatAmount(1200))).toBe('€1,200.00')
      expect(formatDate('2026-09-17')).toBe('09/17/2026')
      expect(formatMonth('2026-09')).toBe('September 2026')
      expect(formatFrequency('monthly')).toBe('Monthly')
    })
  })

  it('translates the recurrence period', () => {
    withEnglish(() => {
      const series: Recurrence = {
        id: 'r1',
        description: 'Rent',
        category: 'Housing',
        kind: 'expense',
        amount: 800,
        day: 5,
        frequency: 'monthly',
        startMonth: '2026-09',
      }
      expect(formatRecurrencePeriod(series)).toBe('starting September 2026')
    })
  })

  it('translates the remote status', () => {
    withEnglish(() => {
      expect(describeRemoteStatus({ state: 'disabled' })).toBe('Local storage — no server configured')
    })
  })
})
