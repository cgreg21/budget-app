/*
 * ui/dialogs/recurrences-group.ts — the "recurrences" section of the options
 * dialog: one row per template, with add, edit and delete.
 *
 * Templates only live here. The transactions they produce are written into
 * each month's file as soon as that month is opened, and are left alone
 * afterwards — deleting a template never touches what it already created.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import type { CategoryStore } from '../../data/category-store.js'
import type { RecurrenceStore } from '../../data/recurrence-store.js'
import type { MonthKey } from '../../domain/month.js'
import type { Recurrence } from '../../domain/recurrence.js'
import { t } from '../../i18n/index.js'
import {
  formatFrequency,
  formatRecurrencePeriod,
  formatSignedAmount,
} from '../format.js'
import type { AdwPreferencesGroup, GtkWidget } from '../gtk-types.js'
import type { Notify } from '../types.js'
import { createRowActionButton } from '../widgets.js'
import { createWriteGuard } from '../write-guard.js'
import { openConfirmDeleteDialog } from './confirm-delete-dialog.js'
import { openRecurrenceDialog } from './recurrence-dialog.js'

export interface RecurrencesGroupOptions {
  store: RecurrenceStore
  categoryStore: CategoryStore
  /** Widget the add / edit dialog is presented on: the options dialog itself. */
  parent: GtkWidget
  /** Start month proposed for a new recurrence — the month on screen. */
  defaultMonth: MonthKey
  notify: Notify
}

export interface RecurrencesGroup {
  group: AdwPreferencesGroup
  /** Releases the store subscription. */
  dispose(): void
}

function describe(recurrence: Recurrence): string {
  return [
    formatFrequency(recurrence.frequency),
    t().recurrencesGroup.dayPrefix(recurrence.day),
    formatRecurrencePeriod(recurrence),
    recurrence.category,
  ].join(' · ')
}

export function createRecurrencesGroup({
  store,
  categoryStore,
  parent,
  defaultMonth,
  notify,
}: RecurrencesGroupOptions): RecurrencesGroup {
  const strings = t().recurrencesGroup
  const group = new Adw.PreferencesGroup({
    title: strings.groupTitle,
    description: strings.groupDescription,
  })

  let rows: GtkWidget[] = []
  const guard = createWriteGuard(notify)

  const edit = (recurrence: Recurrence) => {
    openRecurrenceDialog(parent, {
      categories: categoryStore.categories,
      defaultMonth,
      recurrence,
      onSubmit: (input) => guard(() => {
        store.update(recurrence.id, input)
        notify(strings.updated)
      }),
    })
  }

  const createRow = (recurrence: Recurrence) => {
    const row = new Adw.ActionRow({
      title: recurrence.description,
      subtitle: describe(recurrence),
      activatable: true,
    })
    row.on('activated', () => edit(recurrence))

    row.addSuffix(new Gtk.Label({
      label: formatSignedAmount(recurrence.kind, recurrence.amount),
      cssClasses: ['budget-amount', recurrence.kind === 'income' ? 'budget-income' : 'budget-expense'],
      valign: Gtk.Align.CENTER,
    }))

    row.addSuffix(createRowActionButton({
      iconName: 'document-edit-symbolic',
      tooltip: strings.editTooltip,
      onClick: () => edit(recurrence),
    }))

    row.addSuffix(createRowActionButton({
      iconName: 'user-trash-symbolic',
      tooltip: strings.deleteTooltip,
      onClick: () => openConfirmDeleteDialog(parent, {
        name: recurrence.description || t().common.noDescription,
        body: strings.deleteBody,
        onConfirm: () => guard(() => {
          store.remove(recurrence.id)
          notify(strings.deleted)
        }),
      }),
    }))

    return row
  }

  const createEmptyRow = () => new Adw.ActionRow({
    title: strings.emptyTitle,
    subtitle: strings.emptySubtitle,
  })

  const renderList = () => {
    for (const row of rows) group.remove(row)
    rows = store.recurrences.length > 0 ? store.recurrences.map(createRow) : [createEmptyRow()]
    for (const row of rows) group.add(row)
  }

  group.setHeaderSuffix(createRowActionButton({
    iconName: 'list-add-symbolic',
    tooltip: strings.addTooltip,
    onClick: () => {
      openRecurrenceDialog(parent, {
        categories: categoryStore.categories,
        defaultMonth,
        onSubmit: (input) => guard(() => {
          store.add(input)
          notify(strings.added)
        }),
      })
    },
  }))

  renderList()
  const unsubscribe = store.onChange(renderList)

  return { group, dispose: unsubscribe }
}
