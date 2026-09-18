/*
 * ui/format.ts — display helpers shared by the views. Presentation only:
 * everything here turns model values into locale-aware strings, following
 * the language detected in `i18n/locale.ts`. The currency itself does not
 * follow the language — this is a euro budget regardless of who reads it —
 * but its punctuation does, along with every date and month name.
 */

import { getLocale, t, type Locale } from '../i18n/index.js'
import type { MonthKey } from '../domain/month.js'
import { endMonth, type Recurrence, type RecurrenceFrequency } from '../domain/recurrence.js'
import type { RemoteStatus } from '../domain/remote.js'
import type { TransactionKind } from '../domain/transaction.js'

const LOCALE_TAGS: Record<Locale, string> = {
  fr: 'fr-FR',
  en: 'en-US',
}

function localeTag(): string {
  return LOCALE_TAGS[getLocale()]
}

/** Caches one `Intl` formatter per locale tag, rebuilt only when it changes. */
function cachedFormatter<T>(
  cache: Map<string, T>,
  create: (tag: string) => T,
): T {
  const tag = localeTag()
  let formatter = cache.get(tag)
  if (!formatter) {
    formatter = create(tag)
    cache.set(tag, formatter)
  }
  return formatter
}

const currencyFormatters = new Map<string, Intl.NumberFormat>()
const currencyFormatter = () => cachedFormatter(currencyFormatters, (tag) => new Intl.NumberFormat(tag, {
  style: 'currency',
  currency: 'EUR',
}))

const dateFormatters = new Map<string, Intl.DateTimeFormat>()
const dateFormatter = () => cachedFormatter(dateFormatters, (tag) => new Intl.DateTimeFormat(tag, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}))

const monthFormatters = new Map<string, Intl.DateTimeFormat>()
const monthFormatter = () => cachedFormatter(monthFormatters, (tag) => new Intl.DateTimeFormat(tag, {
  month: 'long',
  year: 'numeric',
}))

const monthNameFormatters = new Map<string, Intl.DateTimeFormat>()
const monthNameFormatter = () => cachedFormatter(
  monthNameFormatters, (tag) => new Intl.DateTimeFormat(tag, { month: 'long' }),
)

const shortMonthFormatters = new Map<string, Intl.DateTimeFormat>()
const shortMonthFormatter = () => cachedFormatter(
  shortMonthFormatters, (tag) => new Intl.DateTimeFormat(tag, { month: 'short' }),
)

const MINUS_SIGN = '−' // U+2212, wider than a hyphen and aligned with "+"

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatAmount(amount: number): string {
  return currencyFormatter().format(amount)
}

/** "+ 1 200,00 €" or "− 45,00 €": the sign comes from the kind, amounts are stored positive. */
export function formatSignedAmount(kind: TransactionKind, amount: number): string {
  return `${kind === 'income' ? '+' : MINUS_SIGN} ${formatAmount(amount)}`
}

/** Formats an ISO date ("2026-09-17"); unparsable values are shown as-is. */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate)
  return Number.isNaN(date.getTime()) ? isoDate : dateFormatter().format(date)
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`
}

/** Formats a month key ("2026-09") as "Septembre 2026". */
export function formatMonth(month: MonthKey): string {
  const date = new Date(`${month}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return month
  return capitalize(monthFormatter().format(date))
}

/** Abbreviated name of a month number, 1 to 12: "Janv.", "Févr.", … */
export function formatShortMonthName(monthNumber: number): string {
  return capitalize(shortMonthFormatter().format(new Date(2000, monthNumber - 1, 1)))
}

/** Full name of a month number, 1 to 12: "Janvier", "Février", … */
export function formatMonthName(monthNumber: number): string {
  return capitalize(monthNameFormatter().format(new Date(2000, monthNumber - 1, 1)))
}

export function formatFrequency(frequency: RecurrenceFrequency): string {
  return t().format.frequency[frequency]
}

/**
 * The span a series covers: "à partir de Septembre 2026" while it never ends,
 * "Septembre 2026 → Août 2027 (12 fois)" once it is limited.
 */
export function formatRecurrencePeriod(recurrence: Recurrence): string {
  const end = endMonth(recurrence)
  return end === undefined
    ? t().format.recurrenceFrom(formatMonth(recurrence.startMonth))
    : t().format.recurrenceRange(formatMonth(recurrence.startMonth), formatMonth(end), recurrence.occurrences ?? 0)
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>()
const timeFormatter = () => cachedFormatter(timeFormatters, (tag) => new Intl.DateTimeFormat(tag, {
  hour: '2-digit',
  minute: '2-digit',
}))

/** A one-line account of where the budget stands, shown in the options dialog. */
export function describeRemoteStatus(status: RemoteStatus): string {
  const strings = t().remoteStatus
  switch (status.state) {
    case 'disabled':
      return strings.localStorage
    case 'connecting':
      return strings.connecting
    case 'online':
      return status.lastSyncedAt
        ? strings.onlineSyncedAt(formatRemoteTime(status.lastSyncedAt))
        : strings.online
    case 'offline':
      return strings.offline
    case 'error':
      return status.message ?? strings.errorDefault
  }
}

function formatRemoteTime(isoDate: string): string {
  const date = new Date(isoDate)
  return Number.isNaN(date.getTime()) ? isoDate : timeFormatter().format(date)
}
