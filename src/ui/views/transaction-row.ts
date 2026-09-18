/*
 * ui/views/transaction-row.ts — one row of the transactions list: the category
 * icon, the description, the category/date subtitle, the signed amount and the
 * edit/delete actions.
 *
 * Transactions produced by a recurrence carry a marker, so it is clear why
 * they are there — and that deleting one only clears it until the month is
 * opened again.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import type { Transaction } from '../../domain/transaction.js'
import { formatDate, formatSignedAmount } from '../format.js'
import type { AdwActionRow } from '../gtk-types.js'
import { createRowActionButton, RECURRING_ICON } from '../widgets.js'

export interface TransactionRowActions {
  onEdit(transaction: Transaction): void
  onDelete(transaction: Transaction): void
}

export function createTransactionRow(
  transaction: Transaction,
  icon: string,
  actions: TransactionRowActions,
): AdwActionRow {
  const isIncome = transaction.kind === 'income'

  const row = new Adw.ActionRow({
    title: transaction.description || '(sans description)',
    subtitle: `${transaction.category} · ${formatDate(transaction.date)}`,
    activatable: true,
  })
  row.on('activated', () => actions.onEdit(transaction))

  // Prefixes stack up from the last added, so the recurrence marker goes in
  // first to end up on the right of the category icon.
  if (transaction.recurrenceId !== undefined) {
    row.addPrefix(new Gtk.Image({
      iconName: RECURRING_ICON,
      tooltipText: 'Transaction récurrente',
      cssClasses: ['dim-label'],
      valign: Gtk.Align.CENTER,
    }))
  }

  row.addPrefix(new Gtk.Image({
    iconName: icon,
    tooltipText: transaction.category,
    valign: Gtk.Align.CENTER,
  }))

  row.addSuffix(new Gtk.Label({
    label: formatSignedAmount(transaction.kind, transaction.amount),
    cssClasses: ['budget-amount', isIncome ? 'budget-income' : 'budget-expense'],
    valign: Gtk.Align.CENTER,
  }))

  row.addSuffix(createRowActionButton({
    iconName: 'document-edit-symbolic',
    tooltip: 'Modifier cette transaction',
    onClick: () => actions.onEdit(transaction),
  }))

  row.addSuffix(createRowActionButton({
    iconName: 'user-trash-symbolic',
    tooltip: 'Supprimer cette transaction',
    onClick: () => actions.onDelete(transaction),
  }))

  return row
}
