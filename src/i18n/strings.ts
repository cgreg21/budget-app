/*
 * i18n/strings.ts — every piece of text the UI shows, in French and English.
 *
 * `Strings` is the contract: both dictionaries must implement it in full, so
 * a translation missing from one of them is a compile error rather than a
 * blank label discovered at runtime. Dynamic text (counts, names, dates) is a
 * function instead of a plain string, so pluralisation and word order stay a
 * decision of the language rather than of the call site.
 *
 * `t()` returns the dictionary for the language the app currently runs in —
 * call sites read `t().categoriesGroup.added`, they never handle a key path.
 */
import { getLocale } from './locale.js'

export interface Strings {
  common: {
    cancel: string
    delete: string
    save: string
    add: string
    type: string
    frequency: string
    expense: string
    income: string
    noDescription: string
  }
  appInfo: {
    description: string
  }
  format: {
    frequency: {
      monthly: string
      quarterly: string
      yearly: string
    }
    recurrenceFrom(month: string): string
    recurrenceRange(start: string, end: string, occurrences: number): string
  }
  remoteStatus: {
    localStorage: string
    connecting: string
    online: string
    onlineSyncedAt(time: string): string
    offline: string
    errorDefault: string
  }
  icons: Record<IconKey, string>
  categoriesGroup: {
    existingCategoriesTitle: string
    newCategoryTitle: string
    nameFieldTitle: string
    addTooltip: string
    iconTooltip(iconLabel: string): string
    alreadyExists(name: string): string
    added: string
    iconChanged: string
    renamed: string
    deleteTooltip: string
    mustKeepOne: string
    deleteBody: string
    deleted: string
  }
  categoryCombo: {
    title: string
  }
  cloudGroup: {
    serverGroupTitle: string
    serverGroupDescription: string
    addressLabel: string
    addressTooltip(hint: string): string
    usernameLabel: string
    passwordLabel: string
    directoryLabel: string
    useServerLabel: string
    useServerSubtitle: string
    statusGroupTitle: string
    syncButton: string
    connectButton: string
    forgetButton: string
    passwordKeptSubtitle: string
    missingAddress: string
    keyringUnavailable: string
    noPasswordSaved: string
    disconnected: string
  }
  confirmDeleteDialog: {
    heading(name: string): string
  }
  editScopeDialog: {
    heading: string
    bodyOccurrence: string
    bodySeriesOnly: string
    occurrenceOption: string
    seriesOption: string
  }
  dataGroup: {
    operationFailed: string
    exportBackupTitle: string
    importBackupTitle: string
    exportCsvTitle: string
    importCsvTitle: string
    backupExported(description: string): string
    noTransactionsToExport: string
    backupGroupTitle: string
    backupGroupDescription: string
    exportBackupSubtitle: string
    exportButton: string
    importBackupSubtitle: string
    importButton: string
    csvGroupTitle: string
    csvGroupDescription: string
    exportCsvSubtitle: string
    importCsvSubtitle: string
    backupFilterName: string
    csvFilterName: string
    monthsCount(count: number): string
    transactionsCount(count: number): string
    categoriesCount(count: number): string
    recurrencesCount(count: number): string
    transactionsExportedCount(count: number): string
    transactionsImportedCount(count: number): string
    categoriesCreatedCount(count: number): string
    linesIgnoredCount(count: number): string
    restored(description: string): string
    nothingToAdd: string
    mergeCompleted(parts: string): string
    csvImportSummary(imported: string, monthsLabel: string): string
  }
  importModeDialog: {
    heading: string
    body(summary: string): string
    mergeOption: string
    replaceOption: string
  }
  iconPickerDialog: {
    title: string
  }
  occurrenceCountField: {
    limitedTitle: string
    limitedSubtitle: string
    countTitle: string
  }
  generalSettings: {
    groupTitle: string
    groupDescription: string
    languageTitle: string
    languageFrench: string
    languageEnglish: string
    currencyTitle: string
    dateFormatTitle: string
    dateLocale: string
    amountFormatTitle: string
    amountLocale: string
    themeTitle: string
    themeSystem: string
    themeLight: string
    themeDark: string
    saveButton: string
    saved: string
  }
  optionsDialog: {
    title: string
    generalTab: string
    thresholdsTab: string
    recurrencesTab: string
    categoriesTab: string
    dataTab: string
    cloudTab: string
  }
  recurrenceDialog: {
    defaultDescription(kind: 'income' | 'expense'): string
    transactionGroupTitle: string
    typeRow: string
    descriptionLabel: string
    amountLabel: string
    rhythmGroupTitle: string
    rhythmGroupDescription: string
    dayLabel: string
    daySubtitle: string
    startMonthLabel: string
    startYearLabel: string
    startYearSubtitle: string
    editTitle: string
    newTitle: string
  }
  recurrencesGroup: {
    groupTitle: string
    groupDescription: string
    dayPrefix(day: number): string
    editTooltip: string
    deleteTooltip: string
    updated: string
    deleteBody: string
    deleted: string
    addTooltip: string
    added: string
    emptyTitle: string
    emptySubtitle: string
  }
  thresholdsGroup: {
    groupTitle: string
    groupDescription(rule: string): string
    lowLabel: string
    mediumLabel: string
    highLabel: string
    orderError(rule: string): string
    saved: string
    saveButton: string
  }
  transactionDialog: {
    defaultDescription(kind: 'income' | 'expense'): string
    typeRow: string
    amountLabel: string
    onceLabel: string
    repeatGroupTitle: string
    repeatGroupDescription: string
    editTitle: string
    newTitle: string
  }
  budgetView: {
    edited: string
    editedRecurring: string
    occurrenceEdited: string
    recurrenceRemoved: string
    recurrenceUpdated: string
    deleteBodyOccurrence(details: string): string
    deleteBodyOnce(details: string): string
    occurrenceDeleted: string
    deleted: string
    tabRecurring: string
    tabOther: string
    tabCharts: string
  }
  categoryCharts: {
    recurringExpenseTitle: string
    otherExpenseTitle: string
    noData: string
    legendTooltip: string
    sliceDetails(category: string, amount: string, percent: string): string
  }
  listTotal: {
    total: string
    countLabel(shown: number, monthCount: number): string
  }
  monthSwitcher: {
    previousMonth: string
    nextMonth: string
    pickMonth: string
    previousYear: string
    nextYear: string
    goToCurrentMonth: string
    monthWithData(month: string): string
  }
  summaryCards: {
    balance: string
    income: string
    expenses: string
  }
  transactionFilters: {
    kindAll: string
    kindIncome: string
    kindExpense: string
    anyCategory: string
    searchPlaceholder: string
    kindTooltip: string
    categoryTooltip: string
    resetTooltip: string
    categoriesCount(count: number): string
  }
  transactionList: {
    recurringTitle: string
    otherTitle: string
    emptyTitle: string
    emptyDescription: string
    noMatchTitle: string
    noMatchDescription: string
  }
  transactionRow: {
    dayLabel: string
    dayValue(day: number): string
    periodLabel: string
    occurrenceLabel: string
    defaultDescription: string
    editTooltip: string
    deleteTooltip: string
  }
  mainWindow: {
    optionsMenu: string
    aboutMenu(appName: string): string
    quitMenu: string
    addTransactionTooltip: string
    added: string
    addedRecurring: string
    retryButton: string
    serverUnreachable: string
    historyMenu: string
    budgetMenu: string
  }
  historyView: {
    title: string
    description: string
    income: string
    expenses: string
    noData: string
  }
}

export type IconKey =
  | 'food' | 'housing' | 'energy' | 'water' | 'heating' | 'diy' | 'transport' | 'travel'
  | 'commute' | 'leisure' | 'games' | 'music' | 'audio' | 'photo' | 'tv' | 'media'
  | 'health' | 'sport' | 'insurance' | 'income' | 'expenses' | 'accounts' | 'shopping'
  | 'spreadsheet' | 'admin' | 'mail' | 'calendar' | 'subscriptions' | 'internet' | 'phone'
  | 'computer' | 'education' | 'books' | 'family' | 'personal' | 'nature' | 'holidays'
  | 'favorite' | 'important' | 'other'

import { fr } from './fr.js'
import { en } from './en.js'

const DICTIONARIES = { fr, en }

/** The strings for the language the app currently runs in. */
export function t(): Strings {
  return DICTIONARIES[getLocale()]
}
