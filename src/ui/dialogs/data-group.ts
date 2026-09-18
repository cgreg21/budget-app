/*
 * ui/dialogs/data-group.ts — the "Données" tab of the options dialog: taking
 * the budget out of the app, and bringing it back in.
 *
 * Two formats, two intentions. The JSON archive is a backup: complete,
 * lossless, restored either by replacing everything or by filling the gaps.
 * The CSV is a bridge to a spreadsheet: readable, editable, and re-importable
 * row by row — but with no identity, so its rows are always *added*.
 *
 * Nothing here talks to the filesystem itself; it picks a file, calls the
 * backup service and turns whatever comes back — a count or an error — into a
 * toast.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import {
  exportBackup,
  exportTransactionsCsv,
  importBackup,
  importTransactionsCsv,
  readBackupFile,
  type BackupStores,
  type CsvImportReport,
} from '../../data/backup-service.js'
import { countBackup, type BackupCounts, type ImportMode } from '../../domain/backup.js'
import { todayIsoDate } from '../../domain/transaction.js'
import { t } from '../../i18n/index.js'
import type { AdwPreferencesGroup, GtkWidget } from '../gtk-types.js'
import type { Notify } from '../types.js'
import { chooseFileToOpen, chooseFileToSave } from './file-dialogs.js'
import { openImportModeDialog } from './import-mode-dialog.js'

const BACKUP_PATTERNS = ['*.json']
const CSV_PATTERNS = ['*.csv']

export interface DataGroupOptions {
  stores: BackupStores
  /** The options dialog: file choosers are parented to its window. */
  parent: GtkWidget
  notify: Notify
}

export function createDataGroups({ stores, parent, notify }: DataGroupOptions): AdwPreferencesGroup[] {
  const strings = t().dataGroup

  /** Every service call may fail on the file itself; the message is for the user. */
  const run = (action: () => void) => {
    try {
      action()
    } catch (error) {
      notify(error instanceof Error ? error.message : strings.operationFailed)
    }
  }

  const exportArchive = () => {
    chooseFileToSave(parent, {
      title: strings.exportBackupTitle,
      initialName: `budget-${todayIsoDate()}.json`,
      filterName: strings.backupFilterName,
      patterns: BACKUP_PATTERNS,
    }, (filePath) => run(() => {
      notify(strings.backupExported(describe(exportBackup(filePath, stores))))
    }))
  }

  const importArchive = () => {
    chooseFileToOpen(parent, {
      title: strings.importBackupTitle,
      filterName: strings.backupFilterName,
      patterns: BACKUP_PATTERNS,
    }, (filePath) => run(() => {
      // Read first: the file is described in the dialog that asks how to apply it.
      const data = readBackupFile(filePath)
      openImportModeDialog(parent, {
        summary: describe(countBackup(data)),
        onChoose: (mode) => run(() => {
          notify(describeImport(mode, importBackup(data, mode, stores)))
        }),
      })
    }))
  }

  const exportCsv = () => {
    chooseFileToSave(parent, {
      title: strings.exportCsvTitle,
      initialName: `budget-transactions-${todayIsoDate()}.csv`,
      filterName: strings.csvFilterName,
      patterns: CSV_PATTERNS,
    }, (filePath) => run(() => {
      const rows = exportTransactionsCsv(filePath, stores)
      notify(rows === 0 ? strings.noTransactionsToExport : strings.transactionsExportedCount(rows))
    }))
  }

  const importCsv = () => {
    chooseFileToOpen(parent, {
      title: strings.importCsvTitle,
      filterName: strings.csvFilterName,
      patterns: CSV_PATTERNS,
    }, (filePath) => run(() => {
      notify(describeCsvImport(importTransactionsCsv(filePath, stores)))
    }))
  }

  const backupGroup = new Adw.PreferencesGroup({
    title: strings.backupGroupTitle,
    description: strings.backupGroupDescription,
  })
  backupGroup.add(createActionRow({
    title: strings.exportBackupTitle,
    subtitle: strings.exportBackupSubtitle,
    buttonLabel: strings.exportButton,
    iconName: 'document-save-symbolic',
    onClick: exportArchive,
  }))
  backupGroup.add(createActionRow({
    title: strings.importBackupTitle,
    subtitle: strings.importBackupSubtitle,
    buttonLabel: strings.importButton,
    iconName: 'document-open-symbolic',
    onClick: importArchive,
  }))

  const csvGroup = new Adw.PreferencesGroup({
    title: strings.csvGroupTitle,
    description: strings.csvGroupDescription,
  })
  csvGroup.add(createActionRow({
    title: strings.exportCsvTitle,
    subtitle: strings.exportCsvSubtitle,
    buttonLabel: strings.exportButton,
    iconName: 'x-office-spreadsheet-symbolic',
    onClick: exportCsv,
  }))
  csvGroup.add(createActionRow({
    title: strings.importCsvTitle,
    subtitle: strings.importCsvSubtitle,
    buttonLabel: strings.importButton,
    iconName: 'x-office-spreadsheet-symbolic',
    onClick: importCsv,
  }))

  return [backupGroup, csvGroup]
}

interface ActionRowOptions {
  title: string
  subtitle: string
  buttonLabel: string
  iconName: string
  onClick: () => void
}

function createActionRow({ title, subtitle, buttonLabel, iconName, onClick }: ActionRowOptions) {
  const row = new Adw.ActionRow({ title, subtitle })
  row.addPrefix(new Gtk.Image({ iconName, valign: Gtk.Align.CENTER }))

  const button = new Gtk.Button({ label: buttonLabel, valign: Gtk.Align.CENTER })
  button.on('clicked', onClick)
  row.addSuffix(button)
  row.setActivatableWidget(button)

  return row
}

function describe({ months, transactions, categories, recurrences }: BackupCounts): string {
  const strings = t().dataGroup
  const parts = [
    strings.monthsCount(months),
    strings.transactionsCount(transactions),
    strings.categoriesCount(categories),
  ]
  if (recurrences > 0) parts.push(strings.recurrencesCount(recurrences))
  return parts.join(', ')
}

function describeImport(mode: ImportMode, counts: BackupCounts): string {
  const strings = t().dataGroup
  if (mode === 'replace') return strings.restored(describe(counts))

  const { transactions, categories, recurrences } = counts
  if (transactions === 0 && categories === 0 && recurrences === 0) {
    return strings.nothingToAdd
  }

  const parts: string[] = []
  if (transactions > 0) parts.push(strings.transactionsCount(transactions))
  if (categories > 0) parts.push(strings.categoriesCount(categories))
  if (recurrences > 0) parts.push(strings.recurrencesCount(recurrences))
  return strings.mergeCompleted(parts.join(', '))
}

function describeCsvImport({ imported, ignored, months, categories }: CsvImportReport): string {
  const strings = t().dataGroup
  let message = strings.csvImportSummary(strings.transactionsImportedCount(imported), strings.monthsCount(months))
  if (categories > 0) message += `, ${strings.categoriesCreatedCount(categories)}`
  if (ignored > 0) message += ` — ${strings.linesIgnoredCount(ignored)}`
  return message
}
