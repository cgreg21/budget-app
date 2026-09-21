/*
 * ui/views/transaction-list.ts — the two scrollable lists of the selected
 * month's transactions, under one shared filter strip.
 *
 * The month it is handed is kept whole: the filter narrows what is drawn,
 * never what is held, so clearing it brings everything back without a round
 * trip to the store — and the summary cards keep describing the month rather
 * than whatever is on screen; the charts, like the lists, follow the filter.
 * That split is also why there are two empty states: a month with no
 * transactions and a filter matching none of them call for very different
 * advice.
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
import { t } from '../../i18n/index.js'
import type { GtkWidget } from '../gtk-types.js'
import { clearListBox } from '../widgets.js'
import { createListTotal } from './list-total.js'
import { createTransactionFilters } from './transaction-filters.js'
import { createTransactionRow, type TransactionRowDeps } from './transaction-row.js'

export interface TransactionListState {
  transactions: readonly Transaction[]
  categories: readonly Category[]
}

/**
 * Filter bar and the two panels (recurring / other) as separate widgets, so
 * the caller can arrange them — side by side, or as tabs — on its own.
 */
export interface TransactionPanels {
  readonly filters: GtkWidget
  readonly recurring: GtkWidget
  readonly other: GtkWidget
  update(state: TransactionListState): void
  /** The month's transactions currently kept by the filter bar. */
  filteredTransactions(): readonly Transaction[]
}

export function createTransactionList(
  deps: TransactionRowDeps,
  /** Called whenever the filter itself changes, e.g. to refresh the charts. */
  onFilterChange: () => void,
): TransactionPanels {
  const createPanel = (recurring: boolean, title: string) => {
    const listBox = new Gtk.ListBox({
      cssClasses: ['boxed-list'],
      marginStart: 0,
      marginEnd: 0,
      marginBottom: 12,
      selectionMode: Gtk.SelectionMode.NONE,
    })

    const scrolled = new Gtk.ScrolledWindow({ vexpand: true, hscrollbarPolicy: Gtk.PolicyType.NEVER })
    scrolled.setChild(listBox)

    const emptyState = new Adw.StatusPage({
      iconName: 'accessories-calculator-symbolic',
      title: t().transactionList.emptyTitle,
      description: t().transactionList.emptyDescription,
      vexpand: true,
    })

    const noMatchState = new Adw.StatusPage({
      iconName: 'system-search-symbolic',
      title: t().transactionList.noMatchTitle,
      description: t().transactionList.noMatchDescription,
      vexpand: true,
    })

    const stack = new Gtk.Stack({ vexpand: true })
    stack.addChild(emptyState)
    stack.addChild(noMatchState)
    stack.addChild(scrolled)

    const total = createListTotal()
    const heading = new Gtk.Label({
      label: title,
      cssClasses: ['heading'],
      xalign: 0,
      marginStart: 12,
      marginTop: 6,
      marginBottom: 6,
    })
    const root = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true, vexpand: true })
    root.append(heading)
    root.append(stack)
    root.append(total.widget)

    return {
      widget: root,
      render: (transactions: readonly Transaction[], categories: readonly Category[]) => {
        const subset = transactions.filter((transaction) => (transaction.recurrenceId !== undefined) === recurring)
        const shown = filterTransactions(subset, filter)

        clearListBox(listBox)
        for (const transaction of shown) {
          const icon = categoryIcon(categories, transaction.category)
          listBox.append(createTransactionRow(transaction, icon, deps))
        }

        total.widget.setVisible(true)
        total.update({ shown, monthCount: subset.length })

        if (shown.length > 0) stack.setVisibleChild(scrolled)
        else stack.setVisibleChild(subset.length === 0 ? emptyState : noMatchState)
      },
    }
  }

  let state: TransactionListState = { transactions: [], categories: [] }
  let filter: TransactionFilter = NO_FILTER
  const recurring = createPanel(true, t().transactionList.recurringTitle)
  const other = createPanel(false, t().transactionList.otherTitle)

  const render = () => {
    const { transactions, categories } = state

    // Offering a filter over an empty month would be pointless, and its reset
    // button — insensitive — would look broken.
    filters.widget.setVisible(transactions.length > 0)
    recurring.render(transactions, categories)
    other.render(transactions, categories)
  }

  // The filter outlives a month change: browsing "loyer" from month to month
  // is the point. A month it matches nothing in lands on the "no result" page,
  // which says so plainly.
  const filters = createTransactionFilters((next) => {
    filter = next
    render()
    onFilterChange()
  })

  return {
    filters: filters.widget,
    recurring: recurring.widget,
    other: other.widget,
    filteredTransactions: () => filterTransactions(state.transactions, filter),
    update: (next) => {
      state = next
      // A category that was renamed or deleted drops the filter that named it,
      // which renders on its own; the call below then settles the rest.
      filters.setCategories(next.categories)
      render()
    },
  }
}
