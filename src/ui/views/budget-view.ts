/*
 * ui/views/budget-view.ts — the window content for the selected month:
 * summary cards, the collapsible category charts and the transaction list,
 * refreshed from the BudgetStore and from the threshold settings colouring the
 * balance.
 */
import Gtk from 'gi:Gtk-4.0'

import type { BudgetStore } from '../../data/budget-store.js'
import type { CategoryStore } from '../../data/category-store.js'
import type { PreferencesStore } from '../../data/preferences-store.js'
import type { ThresholdsStore } from '../../data/thresholds-store.js'
import type { RecurrenceSettings } from '../../domain/recurrence.js'
import type { TransactionInput } from '../../domain/transaction.js'
import { openEditScopeDialog } from '../dialogs/edit-scope-dialog.js'
import { openTransactionDialog } from '../dialogs/transaction-dialog.js'
import type { GtkWidget } from '../gtk-types.js'
import type { DisposableComponent, Notify } from '../types.js'
import { createWriteGuard } from '../write-guard.js'
import { createChartsSection } from './charts-section.js'
import { createSummaryCards } from './summary-cards.js'
import { createTransactionList } from './transaction-list.js'

export interface BudgetViewDeps {
  /** Widget the edit dialog is presented on top of. */
  parent: GtkWidget
  budgetStore: BudgetStore
  categoryStore: CategoryStore
  thresholdsStore: ThresholdsStore
  preferencesStore: PreferencesStore
  notify: Notify
}

export function createBudgetView({
  parent,
  budgetStore,
  categoryStore,
  thresholdsStore,
  preferencesStore,
  notify,
}: BudgetViewDeps): DisposableComponent {
  const summary = createSummaryCards()
  const charts = createChartsSection(preferencesStore)
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
    onDelete: (transaction) => guard(() => {
      budgetStore.remove(transaction.id)
      notify(transaction.recurrenceId === undefined
        ? 'Transaction supprimée'
        : 'Occurrence supprimée — elle réapparaîtra à la prochaine ouverture du mois')
    }),
  })

  const root = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
  root.append(summary.widget)
  root.append(charts.widget)
  root.append(list.widget)

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
      charts.dispose()
    },
  }
}
