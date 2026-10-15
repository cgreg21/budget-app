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
import type { RecurrenceSettings, TransactionInput } from 'budget-lib'
import { t } from '../../i18n/index.js'
import { createCategoryCombo } from '../dialogs/category-combo.js'
import { openEditScopeDialog } from '../dialogs/edit-scope-dialog.js'
import { openTransactionDialog } from '../dialogs/transaction-dialog.js'
import type { GtkWidget } from '../gtk-types.js'
import type { DisposableComponent, Notify, NotifyAction } from '../types.js'
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
  notifyAction: NotifyAction
}

export function createBudgetView({
  parent,
  budgetStore,
  categoryStore,
  thresholdsStore,
  notify,
  notifyAction,
}: BudgetViewDeps): DisposableComponent {
  const summary = createSummaryCards()
  const charts = createCategoryCharts()

  const monthSwitcher = createMonthSwitcher({
    onSelectOlder: () => budgetStore.selectOlderMonth(),
    onSelectNewer: () => budgetStore.selectNewerMonth(),
    onSelect: (month) => budgetStore.selectMonth(month),
  })
  monthSwitcher.widget.setHalign(Gtk.Align.CENTER)
  monthSwitcher.widget.setMarginTop(12)
  monthSwitcher.widget.setMarginBottom(6)

  /** Edit of a transaction that belongs to no series: nothing to arbitrate. */
  const applyEdit = (id: string, input: TransactionInput, settings: RecurrenceSettings | null) => {
    if (settings === null) {
      budgetStore.update(id, input)
      notify(t().budgetView.edited)
      return
    }
    budgetStore.updateSeries(id, input, settings)
    notify(t().budgetView.editedRecurring)
  }

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
            onOccurrence: () => {
              budgetStore.update(transaction.id, input)
              notify(t().budgetView.occurrenceEdited)
            },
            onSeries: () => {
              budgetStore.updateSeries(transaction.id, input, settings)
              notify(settings === null
                ? t().budgetView.recurrenceRemoved
                : t().budgetView.recurrenceUpdated)
            },
          })
        },
      })
    },
    onDelete: (transaction) => {
      const isOccurrence = transaction.recurrenceId !== undefined
      budgetStore.remove(transaction.id)
      notifyAction(
        isOccurrence ? t().budgetView.occurrenceDeleted : t().budgetView.deleted,
        t().trash.undo,
        () => { budgetStore.restore([transaction.id]) },
      )
    },
  }, () => charts.update(list.filteredTransactions()), () => renderSelection())

  const selectionStrings = t().selection
  const selectionToggle = new Gtk.ToggleButton({
    iconName: 'object-select-symbolic',
    tooltipText: selectionStrings.toggleTooltip,
    valign: Gtk.Align.CENTER,
  })
  selectionToggle.on('toggled', () => list.setSelecting(selectionToggle.active))
  const selectionCount = new Gtk.Label({ xalign: 0, hexpand: true, cssClasses: ['dim-label'] })
  const selectAllButton = new Gtk.Button({ label: selectionStrings.selectAll })
  selectAllButton.on('clicked', () => list.selectAll())
  const selectNoneButton = new Gtk.Button({ label: selectionStrings.selectNone })
  selectNoneButton.on('clicked', () => list.selectNone())
  const categoryButton = new Gtk.Button({ label: selectionStrings.changeCategory })
  const deleteButton = new Gtk.Button({
    label: selectionStrings.deleteSelected,
    iconName: 'user-trash-symbolic',
    cssClasses: ['destructive-action'],
  })

  categoryButton.on('clicked', () => {
    const ids = list.selectedIds()
    if (ids.length === 0) return
    const combo = createCategoryCombo(categoryStore.categories, undefined)
    const rows = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['boxed-list'] })
    rows.append(combo.row)
    const dialog = new Adw.AlertDialog({
      heading: selectionStrings.changeCategoryHeading,
      body: selectionStrings.changeCategoryBody(ids.length),
    })
    dialog.setExtraChild(rows)
    dialog.addResponse('cancel', t().common.cancel)
    dialog.addResponse('apply', selectionStrings.apply)
    dialog.setResponseAppearance('apply', Adw.ResponseAppearance.SUGGESTED)
    dialog.setDefaultResponse('apply')
    dialog.setCloseResponse('cancel')
    dialog.on('response', (response) => {
      if (response !== 'apply') return
      const category = combo.read()
      const changed = budgetStore.changeCategory(ids, category)
      list.selectNone()
      notify(selectionStrings.categoryChanged(changed, category))
    })
    dialog.present(parent)
  })

  deleteButton.on('clicked', () => {
    const ids = list.selectedIds()
    if (ids.length === 0) return
    const moved = budgetStore.removeMany(ids)
    list.selectNone()
    notifyAction(selectionStrings.movedToTrash(moved), t().trash.undo, () => { budgetStore.restore(ids) })
  })

  const selectionBar = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 6,
    marginStart: 12,
    marginEnd: 12,
    marginBottom: 6,
  })
  selectionBar.append(selectionToggle)
  selectionBar.append(selectionCount)
  selectionBar.append(selectAllButton)
  selectionBar.append(selectNoneButton)
  selectionBar.append(categoryButton)
  selectionBar.append(deleteButton)

  function renderSelection(): void {
    const selecting = list.selecting
    const count = list.selectedIds().length
    selectionBar.setVisible(budgetStore.transactions.length > 0)
    for (const widget of [selectionCount, selectAllButton, selectNoneButton, categoryButton, deleteButton]) {
      widget.setVisible(selecting)
    }
    selectionCount.setLabel(selectionStrings.selectedCount(count))
    categoryButton.setSensitive(count > 0)
    deleteButton.setSensitive(count > 0)
  }

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
  root.append(selectionBar)
  root.append(bodyBin)

  const render = () => {
    const { transactions } = budgetStore
    summary.update({ totals: budgetStore.totals, thresholds: thresholdsStore.thresholds })
    list.update({ transactions, categories: categoryStore.categories })
    // An empty month has nothing to select.
    if (transactions.length === 0 && selectionToggle.active) selectionToggle.setActive(false)
    renderSelection()
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
