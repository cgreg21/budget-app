/*
 * ui/views/budget-view.ts — the window content for the selected month:
 * summary cards on top, then the transaction list with the category charts in
 * a column beside it, refreshed from the BudgetStore and from the threshold
 * settings colouring the balance.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import type { BudgetStore } from '../../data/budget-store.js'
import type { CategoryStore } from '../../data/category-store.js'
import type { ThresholdsStore } from '../../data/thresholds-store.js'
import type { RecurrenceSettings } from '../../domain/recurrence.js'
import type { TransactionInput } from '../../domain/transaction.js'
import { t } from '../../i18n/index.js'
import { openConfirmDeleteDialog } from '../dialogs/confirm-delete-dialog.js'
import { openEditScopeDialog } from '../dialogs/edit-scope-dialog.js'
import { openTransactionDialog } from '../dialogs/transaction-dialog.js'
import { formatDate, formatSignedAmount } from '../format.js'
import type { GtkWidget } from '../gtk-types.js'
import type { DisposableComponent, Notify } from '../types.js'
import { createWriteGuard } from '../write-guard.js'
import { RECURRING_ICON } from '../widgets.js'
import { createCategoryCharts } from './category-charts.js'
import { createMonthSwitcher } from './month-switcher.js'
import { createSummaryCards } from './summary-cards.js'
import { createTransactionList } from './transaction-list.js'

/** Below this width, recurring/other/charts become bottom tabs instead of columns. */
const COMPACT_WIDTH = 800

/** Icon-only tabs: the title set via addTitled still surfaces as the button's tooltip. */
const OTHER_TAB_ICON = 'folder-symbolic'
const CHARTS_TAB_ICON = 'utilities-system-monitor-symbolic'

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

  const monthSwitcher = createMonthSwitcher({
    onSelectOlder: () => budgetStore.selectOlderMonth(),
    onSelectNewer: () => budgetStore.selectNewerMonth(),
    onSelect: (month) => budgetStore.selectMonth(month),
  })
  monthSwitcher.widget.setHalign(Gtk.Align.CENTER)
  monthSwitcher.widget.setMarginTop(12)
  monthSwitcher.widget.setMarginBottom(6)

  /** Edit of a transaction that belongs to no series: nothing to arbitrate. */
  const applyEdit = (id: string, input: TransactionInput, settings: RecurrenceSettings | null) => guard(() => {
    if (settings === null) {
      budgetStore.update(id, input)
      notify(t().budgetView.edited)
      return
    }
    budgetStore.updateSeries(id, input, settings)
    notify(t().budgetView.editedRecurring)
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
              notify(t().budgetView.occurrenceEdited)
            }),
            onSeries: () => guard(() => {
              budgetStore.updateSeries(transaction.id, input, settings)
              notify(settings === null
                ? t().budgetView.recurrenceRemoved
                : t().budgetView.recurrenceUpdated)
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
        name: transaction.description || t().common.noDescription,
        body: isOccurrence
          ? t().budgetView.deleteBodyOccurrence(details)
          : t().budgetView.deleteBodyOnce(details),
        onConfirm: () => guard(() => {
          budgetStore.remove(transaction.id)
          notify(isOccurrence
            ? t().budgetView.occurrenceDeleted
            : t().budgetView.deleted)
        }),
      })
    },
  }, () => charts.update(list.filteredTransactions()))

  // Side by side above COMPACT_WIDTH; below it, tabs at the bottom keep each
  // panel readable instead of squeezing three columns into a narrow window.
  const wideBody = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 12,
    marginStart: 12,
    marginEnd: 12,
    vexpand: true,
  })

  const compactStack = new Gtk.Stack({ hhomogeneous: false, vhomogeneous: false, vexpand: true })
  const compactSwitcher = new Gtk.StackSwitcher({
    stack: compactStack,
    halign: Gtk.Align.CENTER,
    marginTop: 6,
    marginBottom: 6,
    cssClasses: ['budget-tab-switcher'],
  })

  const bodyHost = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, vexpand: true })

  // Seeded wide; the breakpoint below switches to tabs once it applies.
  wideBody.append(list.recurring)
  wideBody.append(list.other)
  wideBody.append(charts.widget)
  bodyHost.append(wideBody)

  const setCompact = (compact: boolean) => {
    if (compact) {
      wideBody.remove(list.recurring)
      wideBody.remove(list.other)
      wideBody.remove(charts.widget)
      bodyHost.remove(wideBody)

      compactStack.addTitled(list.recurring, 'recurring', t().budgetView.tabRecurring).setIconName(RECURRING_ICON)
      compactStack.addTitled(list.other, 'other', t().budgetView.tabOther).setIconName(OTHER_TAB_ICON)
      compactStack.addTitled(charts.widget, 'charts', t().budgetView.tabCharts).setIconName(CHARTS_TAB_ICON)
      bodyHost.append(compactStack)
      bodyHost.append(compactSwitcher)
    } else {
      compactStack.remove(list.recurring)
      compactStack.remove(list.other)
      compactStack.remove(charts.widget)
      bodyHost.remove(compactStack)
      bodyHost.remove(compactSwitcher)

      wideBody.append(list.recurring)
      wideBody.append(list.other)
      wideBody.append(charts.widget)
      bodyHost.append(wideBody)
    }
  }

  // A plain Gtk.Widget has no "width" property to watch — Adw.Breakpoint is
  // libadwaita's own mechanism for reacting to a container's allocated size.
  // BreakpointBin also drops its child's minimum size, which is what actually
  // lets the window shrink below COMPACT_WIDTH in the first place.
  const bodyBin = new Adw.BreakpointBin({ widthRequest: 360, heightRequest: 240, vexpand: true })
  bodyBin.setChild(bodyHost)
  const breakpoint = new Adw.Breakpoint({
    condition: Adw.BreakpointCondition.parse(`max-width: ${COMPACT_WIDTH}px`),
  })
  breakpoint.on('apply', () => setCompact(true))
  breakpoint.on('unapply', () => setCompact(false))
  bodyBin.addBreakpoint(breakpoint)

  const root = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
  root.append(monthSwitcher.widget)
  root.append(summary.widget)
  root.append(list.filters)
  root.append(bodyBin)

  const render = () => {
    const { transactions } = budgetStore
    summary.update({ totals: budgetStore.totals, thresholds: thresholdsStore.thresholds })
    list.update({ transactions, categories: categoryStore.categories })
    // Charts follow the filter bar, same as the lists — computed after
    // list.update() so filteredTransactions() reflects the current month.
    charts.update(list.filteredTransactions())
    monthSwitcher.update({
      selected: budgetStore.selectedMonth,
      current: budgetStore.currentMonth,
      monthsWithData: budgetStore.monthsWithData,
      hasOlder: budgetStore.hasOlderMonth,
      hasNewer: budgetStore.hasNewerMonth,
    })
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
