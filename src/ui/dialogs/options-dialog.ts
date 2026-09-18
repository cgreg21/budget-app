/*
 * ui/dialogs/options-dialog.ts — the window behind the "Options" menu entry,
 * split in five tabs: the balance thresholds, the recurrences, the categories,
 * the import/export of the data itself and the server holding it.
 *
 * Adw.PreferencesDialog draws the tab switcher itself, one tab per page, and
 * hosts its own toasts — feedback therefore stays on top of the dialog
 * instead of behind it. Each section releases its store subscription when the
 * dialog closes.
 */
import Adw from 'gi:Adw-1'

import type { BudgetStore } from '../../data/budget-store.js'
import type { CategoryStore } from '../../data/category-store.js'
import type { RecurrenceStore } from '../../data/recurrence-store.js'
import type { RemoteStorage } from '../../data/remote/remote-storage.js'
import type { ThresholdsStore } from '../../data/thresholds-store.js'
import type { MonthKey } from '../../domain/month.js'
import type { GtkWidget } from '../gtk-types.js'
import type { Notify } from '../types.js'
import { RECURRING_ICON } from '../widgets.js'
import { createCategoriesGroups } from './categories-group.js'
import { createCloudGroups } from './cloud-group.js'
import { createDataGroups } from './data-group.js'
import { createRecurrencesGroup } from './recurrences-group.js'
import { createThresholdsGroup } from './thresholds-group.js'

const DIALOG_WIDTH = 480
const DIALOG_HEIGHT = 620

export interface OptionsDialogOptions {
  budgetStore: BudgetStore
  categoryStore: CategoryStore
  thresholdsStore: ThresholdsStore
  recurrenceStore: RecurrenceStore
  remoteStorage: RemoteStorage
  /** Start month proposed for a new recurrence — the month on screen. */
  selectedMonth: MonthKey
}

export function openOptionsDialog(
  parent: GtkWidget,
  {
    budgetStore,
    categoryStore,
    thresholdsStore,
    recurrenceStore,
    remoteStorage,
    selectedMonth,
  }: OptionsDialogOptions,
): void {
  const dialog = new Adw.PreferencesDialog({
    title: 'Options',
    contentWidth: DIALOG_WIDTH,
    contentHeight: DIALOG_HEIGHT,
  })

  const notify: Notify = (message) => dialog.addToast(new Adw.Toast({ title: message }))

  const thresholds = createThresholdsGroup({ store: thresholdsStore, notify })
  const thresholdsPage = new Adw.PreferencesPage({
    title: 'Seuils',
    iconName: 'preferences-color-symbolic',
  })
  thresholdsPage.add(thresholds.group)

  const recurrences = createRecurrencesGroup({
    store: recurrenceStore,
    categoryStore,
    parent: dialog,
    defaultMonth: selectedMonth,
    notify,
  })
  const recurrencesPage = new Adw.PreferencesPage({
    title: 'Récurrences',
    iconName: RECURRING_ICON,
  })
  recurrencesPage.add(recurrences.group)

  const categories = createCategoriesGroups({ store: categoryStore, parent: dialog, notify })
  const categoriesPage = new Adw.PreferencesPage({
    title: 'Catégories',
    iconName: 'view-list-symbolic',
  })
  for (const group of categories.groups) categoriesPage.add(group)

  const dataPage = new Adw.PreferencesPage({
    title: 'Données',
    iconName: 'drive-harddisk-symbolic',
  })
  const dataGroups = createDataGroups({
    stores: { budgetStore, categoryStore, thresholdsStore, recurrenceStore },
    parent: dialog,
    notify,
  })
  for (const group of dataGroups) dataPage.add(group)

  const cloud = createCloudGroups({ storage: remoteStorage, notify })
  const cloudPage = new Adw.PreferencesPage({
    title: 'Cloud',
    iconName: 'network-server-symbolic',
  })
  for (const group of cloud.groups) cloudPage.add(group)

  dialog.add(thresholdsPage)
  dialog.add(recurrencesPage)
  dialog.add(categoriesPage)
  dialog.add(dataPage)
  dialog.add(cloudPage)

  dialog.on('closed', () => {
    thresholds.dispose()
    recurrences.dispose()
    categories.dispose()
    cloud.dispose()
  })

  dialog.present(parent)
}
