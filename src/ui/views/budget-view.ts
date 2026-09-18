/*
 * ui/views/budget-view.ts — the window content for the selected month:
 * summary cards on top, then the transaction list with the category charts in
 * a column beside it, refreshed from the BudgetStore and from the threshold
 * settings colouring the balance.
 */
import Gtk from 'gi:Gtk-4.0'

import type { BudgetStore } from '../../data/budget-store.js'
import type { CategoryStore } from '../../data/category-store.js'
import type { ThresholdsStore } from '../../data/thresholds-store.js'
import type { RecurrenceSettings } from '../../domain/recurrence.js'
import type { TransactionInput } from '../../domain/transaction.js'
import { openConfirmDeleteDialog } from '../dialogs/confirm-delete-dialog.js'
import { openEditScopeDialog } from '../dialogs/edit-scope-dialog.js'
import { openTransactionDialog } from '../dialogs/transaction-dialog.js'
import { formatDate, formatSignedAmount } from '../format.js'
import type { GtkWidget } from '../gtk-types.js'
import type { DisposableComponent, Notify } from '../types.js'
import { createWriteGuard } from '../write-guard.js'
import { createCategoryCharts } from './category-charts.js'
import { createSummaryCards } from './summary-cards.js'
import { createTransactionList } from './transaction-list.js'

/** The list spans three of the four columns, leaving a quarter to the charts. */
const LIST_COLUMNS = 3

export interface BudgetViewDeps {
  /** Widget the edit dialog is presented on top of. */
  parent: GtkWidget
  budgetStore: BudgetStore
  categoryStore: CategoryStore
  thresholdsStore: ThresholdsStore
  notify: Notify
}

export function createBudgetView({
  parent,
  budgetStore,
  categoryStore,
  thresholdsStore,
  notify,
}: BudgetViewDeps): DisposableComponent {
  const summary = createSummaryCards()
  const charts = createCategoryCharts()
  const guard = createWriteGuard(notify)

  /** Edit of a transaction that belongs to no series: nothing to arbitrate. */
  const applyEdit = (id: string, input: TransactionInput, settings: RecurrenceSettings | null) => guard(() => {
    if (settings === null) {
      budgetStore.update(id, input)
      notify('Transaction modifiée')
      return
    }
    budgetStore.updateSeries(id, input, settings)
    notify('Transaction modifiée et rendue récurrente')
  })

  const list = createTransactionList({
    recurrenceOf: (transaction) => budgetStore.recurrenceOf(transaction),
    onEdit: (transaction) => {
      const recurrence = budgetStore.recurrenceOf(transaction)

      openTransactionDialog(parent, {
        categories: categoryStore.categories,
        defaultDate: budgetStore.defaultTransactionDate,
        transaction,
        recurrence,
        onSubmit: ({ input, recurrence: settings, recurrenceChanged }) => {
          if (!recurrence) {
            applyEdit(transaction.id, input, settings)
            return
          }

          openEditScopeDialog(parent, {
            canApplyToOccurrence: !recurrenceChanged,
            onOccurrence: () => guard(() => {
              budgetStore.update(transaction.id, input)
              notify('Occurrence modifiée — la récurrence est inchangée')
            }),
            onSeries: () => guard(() => {
              budgetStore.updateSeries(transaction.id, input, settings)
              notify(settings === null
                ? 'Récurrence supprimée — la transaction devient ponctuelle'
                : 'Récurrence mise à jour')
            }),
          })
        },
      })
    },
    onDelete: (transaction) => {
      const isOccurrence = transaction.recurrenceId !== undefined
      const details = [
        formatSignedAmount(transaction.kind, transaction.amount),
        transaction.category,
        formatDate(transaction.date),
      ].join(' · ')

      openConfirmDeleteDialog(parent, {
        name: transaction.description || '(sans description)',
        body: isOccurrence
          ? `${details}\n\nCette transaction vient d’une récurrence : elle réapparaîtra `
            + 'à la prochaine ouverture du mois. Pour qu’elle cesse d’être créée, '
            + 'supprimez plutôt la récurrence dans les options.'
          : `${details}\n\nElle sera retirée du mois définitivement.`,
        onConfirm: () => guard(() => {
          budgetStore.remove(transaction.id)
          notify(isOccurrence
            ? 'Occurrence supprimée — elle réapparaîtra à la prochaine ouverture du mois'
            : 'Transaction supprimée')
        }),
      })
    },
  })

  // Homogeneous columns hand the charts exactly a quarter of the width.
  const body = new Gtk.Grid({ columnHomogeneous: true, vexpand: true })
  body.attach(list.widget, 0, 0, LIST_COLUMNS, 1)
  body.attach(charts.widget, LIST_COLUMNS, 0, 1, 1)

  const root = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
  root.append(summary.widget)
  root.append(body)

  const render = () => {
    const { transactions } = budgetStore
    summary.update({ totals: budgetStore.totals, thresholds: thresholdsStore.thresholds })
    charts.update(transactions)
    list.update({ transactions, categories: categoryStore.categories })
  }

  render()
  const unsubscribes = [
    budgetStore.onChange(render),
    thresholdsStore.onChange(render),
    // Renaming a category or changing its icon shows up in the list right away.
    categoryStore.onChange(render),
  ]

  return {
    widget: root,
    dispose: () => {
      for (const unsubscribe of unsubscribes) unsubscribe()
    },
  }
}
