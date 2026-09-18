/*
 * ui/views/transaction-list.ts — the scrollable list of the selected month's
 * transactions, under the filter strip, with an Adw.StatusPage shown instead
 * while there is nothing to draw.
 *
 * The month it is handed is kept whole: the filter narrows what is drawn,
 * never what is held, so clearing it brings everything back without a round
 * trip to the store — and the summary cards and charts keep describing the
 * month rather than whatever is on screen. That split is also why there are
 * two empty states: a month with no transactions and a filter matching none
 * of them call for very different advice.
 *
 * The categories come along with the transactions: each row shows the icon of
 * its category, resolved by name at display time.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import { categoryIcon, type Category } from '../../domain/category.js'
import {
  filterTransactions,
  NO_FILTER,
  type Transaction,
  type TransactionFilter,
} from '../../domain/transaction.js'
import type { Component } from '../types.js'
import { clearListBox } from '../widgets.js'
import { createListTotal } from './list-total.js'
import { createTransactionFilters } from './transaction-filters.js'
import { createTransactionRow, type TransactionRowDeps } from './transaction-row.js'

export interface TransactionListState {
  transactions: readonly Transaction[]
  categories: readonly Category[]
}

export function createTransactionList(
  deps: TransactionRowDeps,
): Component<TransactionListState> {
  const listBox = new Gtk.ListBox({
    cssClasses: ['boxed-list'],
    marginStart: 12,
    marginEnd: 12,
    marginBottom: 12,
    selectionMode: Gtk.SelectionMode.NONE,
  })

  const scrolled = new Gtk.ScrolledWindow({ vexpand: true, hscrollbarPolicy: Gtk.PolicyType.NEVER })
  scrolled.setChild(listBox)

  const emptyState = new Adw.StatusPage({
    iconName: 'accessories-calculator-symbolic',
    title: 'Aucune transaction',
    description: 'Cliquez sur « + » pour ajouter un revenu ou une dépense à ce mois.',
    vexpand: true,
  })

  const noMatchState = new Adw.StatusPage({
    iconName: 'system-search-symbolic',
    title: 'Aucun résultat',
    description: 'Ce mois contient des transactions, mais aucune ne correspond au filtre.',
    vexpand: true,
  })

  const stack = new Gtk.Stack({ vexpand: true })
  stack.addChild(emptyState)
  stack.addChild(noMatchState)
  stack.addChild(scrolled)

  const total = createListTotal()

  let state: TransactionListState = { transactions: [], categories: [] }
  let filter: TransactionFilter = NO_FILTER

  const render = () => {
    const { transactions, categories } = state
    const shown = filterTransactions(transactions, filter)

    clearListBox(listBox)
    for (const transaction of shown) {
      const icon = categoryIcon(categories, transaction.category)
      listBox.append(createTransactionRow(transaction, icon, deps))
    }

    // Offering a filter over an empty month would be pointless, and its reset
    // button — insensitive — would look broken.
    filters.widget.setVisible(transactions.length > 0)

    // Nothing to add up behind either empty state.
    total.widget.setVisible(shown.length > 0)
    if (shown.length > 0) total.update({ shown, monthCount: transactions.length })

    if (shown.length > 0) stack.setVisibleChild(scrolled)
    else stack.setVisibleChild(transactions.length === 0 ? emptyState : noMatchState)
  }

  // The filter outlives a month change: browsing "loyer" from month to month
  // is the point. A month it matches nothing in lands on the "no result" page,
  // which says so plainly.
  const filters = createTransactionFilters((next) => {
    filter = next
    render()
  })

  // Takes every pixel the charts column leaves on its side.
  const root = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true })
  root.append(filters.widget)
  root.append(stack)
  root.append(total.widget)

  return {
    widget: root,
    update: (next) => {
      state = next
      // A category that was renamed or deleted drops the filter that named it,
      // which renders on its own; the call below then settles the rest.
      filters.setCategories(next.categories)
      render()
    },
  }
}
