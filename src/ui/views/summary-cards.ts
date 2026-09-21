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
import { t } from '../../i18n/index.js'
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
  // FlowBox reflows its children onto a new line once they no longer fit,
  // instead of squeezing them — unlike a plain Box.
  const container = new Gtk.FlowBox({
    homogeneous: true,
    columnSpacing: 12,
    rowSpacing: 12,
    minChildrenPerLine: 1,
    maxChildrenPerLine: 3,
    selectionMode: Gtk.SelectionMode.NONE,
    marginTop: 12,
    marginBottom: 12,
    marginStart: 12,
    marginEnd: 12,
  })

  const balance = createCard(t().summaryCards.balance, 'budget-balance')
  const income = createCard(t().summaryCards.income, 'budget-income-card')
  const expense = createCard(t().summaryCards.expenses, 'budget-expense-card')

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
