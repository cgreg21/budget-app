/*
 * ui/views/transaction-list.ts — the scrollable list of the selected month's
 * transactions, with an Adw.StatusPage shown instead while the month is empty.
 *
 * The categories come along with the transactions: each row shows the icon of
 * its category, resolved by name at display time.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import { categoryIcon, type Category } from '../../domain/category.js'
import type { Transaction } from '../../domain/transaction.js'
import type { Component } from '../types.js'
import { clearListBox } from '../widgets.js'
import { createTransactionRow, type TransactionRowActions } from './transaction-row.js'

export interface TransactionListState {
  transactions: readonly Transaction[]
  categories: readonly Category[]
}

export function createTransactionList(
  actions: TransactionRowActions,
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

  const stack = new Gtk.Stack()
  stack.addChild(emptyState)
  stack.addChild(scrolled)

  return {
    widget: stack,
    update: ({ transactions, categories }) => {
      clearListBox(listBox)
      for (const transaction of transactions) {
        const icon = categoryIcon(categories, transaction.category)
        listBox.append(createTransactionRow(transaction, icon, actions))
      }
      stack.setVisibleChild(transactions.length === 0 ? emptyState : scrolled)
    },
  }
}
