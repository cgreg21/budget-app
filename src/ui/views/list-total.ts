/*
 * ui/views/list-total.ts — the strip closing the transaction list: how many
 * rows are shown, and what they come to.
 *
 * It deliberately totals what is on screen, filters included. The summary
 * cards at the top already answer "how did the month go"; this answers "how
 * much is that, then", which is the question a filter is usually asked to
 * settle — how much went on groceries, how much came in this month.
 *
 * The figure is a balance, not a sum: a list mixing both kinds would otherwise
 * add a salary to a rent. Filtered down to one kind — the common case — it
 * simply reads as the total of that kind, signed.
 */
import Gtk from 'gi:Gtk-4.0'

import { computeTotals, type Transaction } from '../../domain/transaction.js'
import { formatAmount } from '../format.js'
import type { Component } from '../types.js'

export interface ListTotalState {
  /** The rows on screen. */
  shown: readonly Transaction[]
  /** How many the month holds in all, to tell a narrowed count from a full one. */
  monthCount: number
}

function countLabel(shown: number, monthCount: number): string {
  const plural = shown > 1 ? 's' : ''
  return shown === monthCount
    ? `${shown} transaction${plural}`
    : `${shown} transaction${plural} sur ${monthCount}`
}

export function createListTotal(): Component<ListTotalState> {
  const count = new Gtk.Label({ cssClasses: ['dim-label'], xalign: 0, hexpand: true })
  const caption = new Gtk.Label({ label: 'Total', cssClasses: ['dim-label'] })
  const amount = new Gtk.Label({ cssClasses: ['budget-amount'] })

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
    marginStart: 12,
    marginEnd: 12,
    marginBottom: 12,
  })
  box.append(count)
  box.append(caption)
  box.append(amount)

  return {
    widget: box,
    update: ({ shown, monthCount }) => {
      const { balance } = computeTotals(shown)
      count.setLabel(countLabel(shown.length, monthCount))
      amount.setLabel(formatAmount(balance))
      // Left plain at zero: neither green nor red says anything there.
      amount.setCssClasses(balance === 0
        ? ['budget-amount']
        : ['budget-amount', balance > 0 ? 'budget-income' : 'budget-expense'])
    },
  }
}
