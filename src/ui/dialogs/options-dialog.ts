/*
 * ui/dialogs/options-dialog.ts — the window behind the "Options" menu entry,
 * split in tabs: the balance thresholds, the recurrences, the categories,
 * the import/export of the data itself and the bank
 * the transactions are imported from.
 *
 * Adw.PreferencesDialog draws the tab switcher itself, one tab per page, and
 * hosts its own toasts — feedback therefore stays on top of the dialog
 * instead of behind it. Each section releases its store subscription when the
 * dialog closes.
 */
import Adw from 'gi:Adw-1'

import type { BankService } from '../../data/bank/bank-service.js'
import type { BudgetStore } from '../../data/budget-store.js'
import type { CalendarSyncService } from '../../data/calendar/calendar-sync-service.js'
import type { CategoryStore } from '../../data/category-store.js'
import type { ConfigArchiveService } from '../../data/config-archive-service.js'
import type { GeneralSettingsStore } from '../../data/general-settings-store.js'
import type { RecurrenceStore } from '../../data/recurrence-store.js'
import type { ThresholdsStore } from '../../data/thresholds-store.js'
import type { MonthKey } from 'budget-lib'
import { t } from '../../i18n/index.js'
import type { GtkWidget } from '../gtk-types.js'
import type { Notify } from '../types.js'
import { RECURRING_ICON } from '../widgets.js'
import { createBankGroups } from './bank-group.js'
import { createCategoriesGroups } from './categories-group.js'
import { createCalendarGroups } from './calendar-group.js'
import { createDataGroups } from './data-group.js'
import { createGeneralGroup } from './general-group.js'
import { createRecurrencesGroup } from './recurrences-group.js'
import { createThresholdsGroup } from './thresholds-group.js'

const DIALOG_WIDTH = 480
const DIALOG_HEIGHT = 620

export interface OptionsDialogOptions {
  budgetStore: BudgetStore
  categoryStore: CategoryStore
  generalSettingsStore: GeneralSettingsStore
  thresholdsStore: ThresholdsStore
  recurrenceStore: RecurrenceStore
  bankService: BankService
  calendarSyncService: CalendarSyncService
  configArchive: ConfigArchiveService
  /** Start month proposed for a new recurrence — the month on screen. */
  selectedMonth: MonthKey
}

export function openOptionsDialog(
  parent: GtkWidget,
  {
    budgetStore,
    categoryStore,
    generalSettingsStore,
    thresholdsStore,
    recurrenceStore,
    bankService,
    calendarSyncService,
    configArchive,
    selectedMonth,
  }: OptionsDialogOptions,
): void {
  const dialog = new Adw.PreferencesDialog({
    title: t().optionsDialog.title,
    contentWidth: DIALOG_WIDTH,
    contentHeight: DIALOG_HEIGHT,
  })

  const notify: Notify = (message) => dialog.addToast(new Adw.Toast({ title: message }))

  const general = createGeneralGroup({ store: generalSettingsStore, notify })
  const generalPage = new Adw.PreferencesPage({
    title: t().optionsDialog.generalTab,
    iconName: 'preferences-system-symbolic',
  })
  generalPage.add(general.group)

  const thresholds = createThresholdsGroup({ store: thresholdsStore, notify })
  const thresholdsPage = new Adw.PreferencesPage({
    title: t().optionsDialog.thresholdsTab,
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
    title: t().optionsDialog.recurrencesTab,
    iconName: RECURRING_ICON,
  })
  recurrencesPage.add(recurrences.group)

  const categories = createCategoriesGroups({ store: categoryStore, parent: dialog, notify })
  const categoriesPage = new Adw.PreferencesPage({
    title: t().optionsDialog.categoriesTab,
    iconName: 'view-list-symbolic',
  })
  for (const group of categories.groups) categoriesPage.add(group)

  const dataPage = new Adw.PreferencesPage({
    title: t().optionsDialog.dataTab,
    iconName: 'drive-harddisk-symbolic',
  })
  const dataGroups = createDataGroups({
    stores: { budgetStore, categoryStore, thresholdsStore, recurrenceStore },
    configArchive,
    parent: dialog,
    notify,
  })
  for (const group of dataGroups) dataPage.add(group)

  const bank = createBankGroups({ service: bankService, parent: dialog, notify })
  const bankPage = new Adw.PreferencesPage({
    title: t().optionsDialog.bankTab,
    iconName: 'folder-download-symbolic',
  })
  for (const group of bank.groups) bankPage.add(group)

  const calendar = createCalendarGroups({ service: calendarSyncService, notify })
  const calendarPage = new Adw.PreferencesPage({
    title: t().optionsDialog.calendarTab,
    iconName: 'x-office-calendar-symbolic',
  })
  for (const group of calendar.groups) calendarPage.add(group)

  dialog.add(generalPage)
  dialog.add(thresholdsPage)
  dialog.add(recurrencesPage)
  dialog.add(categoriesPage)
  dialog.add(dataPage)
  dialog.add(bankPage)
  dialog.add(calendarPage)

  dialog.on('closed', () => {
    thresholds.dispose()
    general.dispose()
    recurrences.dispose()
    categories.dispose()
    bank.dispose()
    calendar.dispose()
  })

  dialog.present(parent)
}
