/*
 * ui/dialogs/trash-dialog.ts — the deleted transactions, with Restore, Delete
 * forever and Empty the trash.
 *
 * Every row carries a check button, so restoring or deleting several at once
 * is the normal way to use it; the buttons in the bottom bar act on the
 * checked rows. Permanent deletions are confirmed, restoring is not: it undoes
 * itself the same way it was done.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import type { TrashedTransaction } from 'budget-lib'
import type { BudgetStore } from '../../data/budget-store.js'
import { t } from '../../i18n/index.js'
import { formatDate, formatSignedAmount } from '../format.js'
import type { GtkWidget } from '../gtk-types.js'
import type { Notify } from '../types.js'
import { clearListBox, createRowActionButton } from '../widgets.js'

const DIALOG_WIDTH = 520
const DIALOG_HEIGHT = 560
const CANCEL = 'cancel'
const CONFIRM = 'confirm'

export interface TrashDialogOptions {
  budgetStore: BudgetStore
}

/** The local calendar day of an ISO date-time, as `YYYY-MM-DD`. */
function localDay(isoDateTime: string): string {
  const date = new Date(isoDateTime)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function confirmDestructive(parent: GtkWidget, heading: string, body: string, label: string, onConfirm: () => void): void {
  const dialog = new Adw.AlertDialog({ heading, body })
  dialog.addResponse(CANCEL, t().common.cancel)
  dialog.addResponse(CONFIRM, label)
  dialog.setResponseAppearance(CONFIRM, Adw.ResponseAppearance.DESTRUCTIVE)
  dialog.setDefaultResponse(CANCEL)
  dialog.setCloseResponse(CANCEL)
  dialog.on('response', (response) => {
    if (response === CONFIRM) onConfirm()
  })
  dialog.present(parent)
}

export function openTrashDialog(parent: GtkWidget, { budgetStore }: TrashDialogOptions): void {
  const strings = t().trash
  const dialog = new Adw.Dialog({ title: strings.title, contentWidth: DIALOG_WIDTH, contentHeight: DIALOG_HEIGHT })

  const toasts = new Adw.ToastOverlay({ vexpand: true })
  const notify: Notify = (message) => toasts.addToast(new Adw.Toast({ title: message }))
  const selected = new Set<string>()

  const listBox = new Gtk.ListBox({
    cssClasses: ['boxed-list'],
    selectionMode: Gtk.SelectionMode.NONE,
    marginStart: 12,
    marginEnd: 12,
    marginTop: 12,
    marginBottom: 12,
    valign: Gtk.Align.START,
  })
  const scrolled = new Gtk.ScrolledWindow({ vexpand: true, hscrollbarPolicy: Gtk.PolicyType.NEVER })
  scrolled.setChild(listBox)
  const emptyState = new Adw.StatusPage({
    iconName: 'user-trash-symbolic',
    title: strings.emptyTitle,
    description: strings.emptyDescription,
    vexpand: true,
  })
  const stack = new Gtk.Stack({ vexpand: true })
  stack.addChild(emptyState)
  stack.addChild(scrolled)
  toasts.setChild(stack)

  const header = new Adw.HeaderBar()
  const emptyButton = new Gtk.Button({ label: strings.emptyTrash, cssClasses: ['destructive-action'] })
  header.packEnd(emptyButton)

  const selectionLabel = new Gtk.Label({ xalign: 0, hexpand: true, cssClasses: ['dim-label'] })
  const selectAllButton = new Gtk.Button({ label: strings.selectAll })
  const selectNoneButton = new Gtk.Button({ label: strings.selectNone })
  const restoreButton = new Gtk.Button({ label: strings.restore, cssClasses: ['suggested-action'] })
  const deleteButton = new Gtk.Button({ label: strings.deleteForever, cssClasses: ['destructive-action'] })
  const actions = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 6,
    marginStart: 12,
    marginEnd: 12,
    marginTop: 6,
    marginBottom: 6,
  })
  for (const widget of [selectionLabel, selectAllButton, selectNoneButton, restoreButton, deleteButton]) actions.append(widget)

  const toolbar = new Adw.ToolbarView()
  toolbar.addTopBar(header)
  toolbar.addBottomBar(actions)
  toolbar.setContent(toasts)
  dialog.child = toolbar

  const restore = (ids: readonly string[]) => {
    const restored = budgetStore.restore(ids)
    if (restored > 0) notify(strings.restored(restored))
  }

  const deleteForever = (ids: readonly string[]) => {
    confirmDestructive(dialog, strings.deleteForeverHeading(ids.length), strings.deleteForeverBody, strings.deleteForever, () => {
      notify(strings.deletedForever(budgetStore.deleteForever(ids)))
    })
  }

  const createRow = (item: TrashedTransaction) => {
    const row = new Adw.ActionRow({
      title: item.description || t().common.noDescription,
      subtitle: [item.category, formatDate(item.date), strings.deletedOn(formatDate(localDay(item.deletedAt)))].join(' · '),
      activatable: true,
    })
    const check = new Gtk.CheckButton({ active: selected.has(item.id), valign: Gtk.Align.CENTER })
    check.on('toggled', () => {
      if (check.active) selected.add(item.id)
      else selected.delete(item.id)
      renderActions()
    })
    row.addPrefix(check)
    row.on('activated', () => check.setActive(!check.active))
    row.addSuffix(new Gtk.Label({
      label: formatSignedAmount(item.kind, item.amount),
      cssClasses: ['budget-amount', item.kind === 'income' ? 'budget-income' : 'budget-expense'],
      valign: Gtk.Align.CENTER,
    }))
    row.addSuffix(createRowActionButton({
      iconName: 'edit-undo-symbolic',
      tooltip: strings.restoreTooltip,
      onClick: () => restore([item.id]),
    }))
    row.addSuffix(createRowActionButton({
      iconName: 'user-trash-symbolic',
      tooltip: strings.deleteForeverTooltip,
      onClick: () => deleteForever([item.id]),
    }))
    return row
  }

  function renderActions(): void {
    const count = selected.size
    selectionLabel.setLabel(strings.selectedCount(count))
    restoreButton.setSensitive(count > 0)
    deleteButton.setSensitive(count > 0)
  }

  const render = () => {
    const items = budgetStore.trash
    const present = new Set(items.map((item) => item.id))
    for (const id of [...selected]) if (!present.has(id)) selected.delete(id)

    clearListBox(listBox)
    for (const item of items) listBox.append(createRow(item))
    stack.setVisibleChild(items.length > 0 ? scrolled : emptyState)
    emptyButton.setSensitive(items.length > 0)
    actions.setVisible(items.length > 0)
    renderActions()
  }

  selectAllButton.on('clicked', () => {
    for (const item of budgetStore.trash) selected.add(item.id)
    render()
  })
  selectNoneButton.on('clicked', () => {
    selected.clear()
    render()
  })
  restoreButton.on('clicked', () => restore([...selected]))
  deleteButton.on('clicked', () => deleteForever([...selected]))
  emptyButton.on('clicked', () => {
    confirmDestructive(dialog, strings.emptyHeading, strings.emptyBody(budgetStore.trash.length), strings.emptyTrash, () => {
      budgetStore.emptyTrash()
      notify(strings.emptied)
    })
  })

  render()
  const unsubscribe = budgetStore.onTrashChange(render)
  dialog.on('closed', unsubscribe)

  dialog.present(parent)
}
