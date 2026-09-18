/*
 * ui/format.ts — display helpers shared by the views. Presentation only:
 * everything here turns model values into French-locale strings.
 */

import type { MonthKey } from '../domain/month.js'
import type { RecurrenceFrequency } from '../domain/recurrence.js'
import type { TransactionKind } from '../domain/transaction.js'

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const monthFormatter = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
})

const monthNameFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long' })

const shortMonthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short' })

const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  yearly: 'Annuelle',
}

const MINUS_SIGN = '−' // U+2212, wider than a hyphen and aligned with "+"

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatAmount(amount: number): string {
  return currencyFormatter.format(amount)
}

/** "+ 1 200,00 €" or "− 45,00 €": the sign comes from the kind, amounts are stored positive. */
export function formatSignedAmount(kind: TransactionKind, amount: number): string {
  return `${kind === 'income' ? '+' : MINUS_SIGN} ${formatAmount(amount)}`
}

/** Formats an ISO date ("2026-09-17"); unparsable values are shown as-is. */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate)
  return Number.isNaN(date.getTime()) ? isoDate : dateFormatter.format(date)
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`
}

/** Formats a month key ("2026-09") as "Septembre 2026". */
export function formatMonth(month: MonthKey): string {
  const date = new Date(`${month}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return month
  return capitalize(monthFormatter.format(date))
}

/** Abbreviated name of a month number, 1 to 12: "Janv.", "Févr.", … */
export function formatShortMonthName(monthNumber: number): string {
  return capitalize(shortMonthFormatter.format(new Date(2000, monthNumber - 1, 1)))
}

/** Full name of a month number, 1 to 12: "Janvier", "Février", … */
export function formatMonthName(monthNumber: number): string {
  return capitalize(monthNameFormatter.format(new Date(2000, monthNumber - 1, 1)))
}

export function formatFrequency(frequency: RecurrenceFrequency): string {
  return FREQUENCY_LABELS[frequency]
}
