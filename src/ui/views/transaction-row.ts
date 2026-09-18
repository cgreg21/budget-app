/*
 * ui/views/transaction-row.ts — one row of the transactions list: the category
 * icon, the description, the category/date subtitle, the signed amount and the
 * edit/delete actions.
 *
 * Green for income, red for expenses: the same colour runs through the edge on
 * the left, the disc behind the category icon and the amount. Transactions
 * produced by a recurrence stand on a darker background, so it is clear why
 * they are there — and that deleting one only clears it until the month is
 * opened again. Resting the pointer on one of them pops up the series it
 * comes from: rhythm, day and span, none of which the row itself can show.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import type { Recurrence } from '../../domain/recurrence.js'
import type { Transaction } from '../../domain/transaction.js'
import {
  formatDate,
  formatFrequency,
  formatRecurrencePeriod,
  formatSignedAmount,
} from '../format.js'
import type { AdwActionRow, GtkWidget } from '../gtk-types.js'
import { createRowActionButton, onNotify } from '../widgets.js'

/** Long enough that sweeping the list does not flash a popover on every row. */
const HOVER_DELAY_MS = 350

export interface TransactionRowDeps {
  onEdit(transaction: Transaction): void
  onDelete(transaction: Transaction): void
  /** The series a row comes from, read afresh every time the details pop up. */
  recurrenceOf(transaction: Transaction): Recurrence | undefined
}

function createDetails(recurrence: Recurrence, transaction: Transaction): GtkWidget {
  const entries: readonly (readonly [string, string])[] = [
    ['Fréquence', formatFrequency(recurrence.frequency)],
    ['Jour', `le ${recurrence.day} du mois`],
    ['Période', formatRecurrencePeriod(recurrence)],
    ['Cette occurrence', formatDate(transaction.date)],
  ]

  const grid = new Gtk.Grid({ columnSpacing: 12, rowSpacing: 4 })
  entries.forEach(([label, value], index) => {
    grid.attach(new Gtk.Label({ label, cssClasses: ['dim-label'], xalign: 0 }), 0, index, 1, 1)
    grid.attach(new Gtk.Label({ label: value, xalign: 0 }), 1, index, 1, 1)
  })

  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 })
  box.append(new Gtk.Label({
    label: recurrence.description || 'Transaction récurrente',
    cssClasses: ['heading'],
    xalign: 0,
  }))
  box.append(grid)
  return box
}

/**
 * Shows the series behind the row while the pointer rests on it.
 *
 * The popover is deliberately `autohide: false`: an auto-hiding one takes a
 * grab, and the list underneath would stop answering clicks as soon as the
 * details appeared. The recurrence is looked up on hover rather than kept in
 * the row, so the panel is never stale after an edit in the options dialog.
 */
function attachRecurrenceDetails(
  row: AdwActionRow,
  transaction: Transaction,
  recurrenceOf: (transaction: Transaction) => Recurrence | undefined,
): void {
  const popover = new Gtk.Popover({
    autohide: false,
    position: Gtk.PositionType.TOP,
    cssClasses: ['budget-details'],
  })
  popover.setParent(row)

  let timer: NodeJS.Timeout | undefined
  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  const motion = new Gtk.EventControllerMotion()
  motion.on('enter', () => {
    cancel()
    timer = setTimeout(() => {
      timer = undefined
      const recurrence = recurrenceOf(transaction)
      if (recurrence === undefined) return // the series was deleted meanwhile
      popover.setChild(createDetails(recurrence, transaction))
      popover.popup()
    }, HOVER_DELAY_MS)
  })
  motion.on('leave', () => {
    cancel()
    popover.popdown()
  })
  row.addController(motion)

  // Clicking through to the edit dialog leaves the pointer where it is: the
  // panel would otherwise hang over the dialog, since it hides itself for
  // nobody.
  row.on('activated', () => {
    cancel()
    popover.popdown()
  })

  // A popover parented by hand outlives its row: rebuilding the list would
  // leave GTK holding a child nobody released. Losing the root means the row
  // has just left the list.
  onNotify(row, 'root', () => {
    if (row.getRoot() !== null) return
    cancel()
    popover.popdown()
    popover.unparent()
  })
}

export function createTransactionRow(
  transaction: Transaction,
  icon: string,
  deps: TransactionRowDeps,
): AdwActionRow {
  const isIncome = transaction.kind === 'income'
  // Green or red, shared by the edge, the icon's disc and the amount.
  const kindClass = isIncome ? 'budget-income' : 'budget-expense'
  const iconClass = isIncome ? 'budget-icon-income' : 'budget-icon-expense'

  const row = new Adw.ActionRow({
    title: transaction.description || '(sans description)',
    subtitle: `${transaction.category}`,
    activatable: true,
  })
  row.on('activated', () => deps.onEdit(transaction))

  // Added after construction: setting `cssClasses` here would drop the
  // `activatable` class GTK puts on the row itself.
  row.addCssClass(isIncome ? 'budget-row-income' : 'budget-row-expense')
  if (transaction.recurrenceId !== undefined) {
    row.addCssClass('budget-row-recurring')
    attachRecurrenceDetails(row, transaction, deps.recurrenceOf)
  }

  // The category icon is the row's only prefix. Being symbolic, it is painted
  // white on the coloured disc the stylesheet gives it.
  row.addPrefix(new Gtk.Image({
    iconName: icon,
    tooltipText: transaction.category,
    cssClasses: ['budget-icon', iconClass],
    valign: Gtk.Align.CENTER,
  }))

  row.addSuffix(new Gtk.Label({
    label: formatSignedAmount(transaction.kind, transaction.amount),
    cssClasses: ['budget-amount', kindClass],
    valign: Gtk.Align.CENTER,
  }))

  row.addSuffix(createRowActionButton({
    iconName: 'document-edit-symbolic',
    tooltip: 'Modifier cette transaction',
    onClick: () => deps.onEdit(transaction),
  }))

  row.addSuffix(createRowActionButton({
    iconName: 'user-trash-symbolic',
    tooltip: 'Supprimer cette transaction',
    onClick: () => deps.onDelete(transaction),
  }))

  return row
}
