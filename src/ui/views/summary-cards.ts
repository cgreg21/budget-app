/*
 * ui/views/summary-cards.ts — the "balance / income / expenses" cards
 * sitting at the top of the window.
 *
 * The balance card gets a background colour telling at a glance which band
 * the month falls into; the thresholds come from the options dialog.
 */
import Gtk from 'gi:Gtk-4.0'

import { balanceLevel, type BalanceThresholds } from '../../domain/balance.js'
import type { Totals } from '../../domain/transaction.js'
import { formatAmount } from '../format.js'
import type { GtkWidget } from '../gtk-types.js'
import type { Component } from '../types.js'

export interface SummaryState {
  totals: Totals
  thresholds: BalanceThresholds
}

interface Card {
  widget: GtkWidget
  setValue(text: string): void
  /** Swaps the card's variant class, e.g. the balance band. */
  setVariant(cssClass: string): void
}

function createCard(title: string, cssClass: string): Card {
  const baseClasses = ['card', 'budget-card', cssClass]

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    cssClasses: baseClasses,
    hexpand: true,
  })

  const valueLabel = new Gtk.Label({ label: formatAmount(0), cssClasses: ['title-2'], xalign: 0 })

  box.append(new Gtk.Label({ label: title, cssClasses: ['caption', 'dim-label'], xalign: 0 }))
  box.append(valueLabel)

  return {
    widget: box,
    setValue: (text) => valueLabel.setLabel(text),
    setVariant: (variant) => box.setCssClasses([...baseClasses, variant]),
  }
}

export function createSummaryCards(): Component<SummaryState> {
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 12,
    marginTop: 12,
    marginBottom: 12,
    marginStart: 12,
    marginEnd: 12,
    homogeneous: true,
  })

  const balance = createCard('Solde', 'budget-balance')
  const income = createCard('Revenus', 'budget-income-card')
  const expense = createCard('Dépenses', 'budget-expense-card')

  container.append(balance.widget)
  container.append(income.widget)
  container.append(expense.widget)

  return {
    widget: container,
    update: ({ totals, thresholds }) => {
      balance.setValue(formatAmount(totals.balance))
      balance.setVariant(`budget-balance-${balanceLevel(totals.balance, thresholds)}`)
      income.setValue(formatAmount(totals.income))
      expense.setValue(formatAmount(totals.expense))
    },
  }
}
