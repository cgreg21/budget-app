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
import type { AdwPreferencesGroup, GtkWidget } from '../gtk-types.js'
import type { Notify } from '../types.js'
import { chooseFileToOpen, chooseFileToSave } from './file-dialogs.js'
import { openImportModeDialog } from './import-mode-dialog.js'

const BACKUP_FILTER = { filterName: 'Sauvegarde Budget', patterns: ['*.json'] }
const CSV_FILTER = { filterName: 'Fichier CSV', patterns: ['*.csv'] }

export interface DataGroupOptions {
  stores: BackupStores
  /** The options dialog: file choosers are parented to its window. */
  parent: GtkWidget
  notify: Notify
}

export function createDataGroups({ stores, parent, notify }: DataGroupOptions): AdwPreferencesGroup[] {
  /** Every service call may fail on the file itself; the message is for the user. */
  const run = (action: () => void) => {
    try {
      action()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Opération impossible')
    }
  }

  const exportArchive = () => {
    chooseFileToSave(parent, {
      title: 'Exporter une sauvegarde',
      initialName: `budget-${todayIsoDate()}.json`,
      ...BACKUP_FILTER,
    }, (filePath) => run(() => {
      notify(`Sauvegarde exportée — ${describe(exportBackup(filePath, stores))}`)
    }))
  }

  const importArchive = () => {
    chooseFileToOpen(parent, {
      title: 'Importer une sauvegarde',
      ...BACKUP_FILTER,
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
      title: 'Exporter les transactions',
      initialName: `budget-transactions-${todayIsoDate()}.csv`,
      ...CSV_FILTER,
    }, (filePath) => run(() => {
      const rows = exportTransactionsCsv(filePath, stores)
      notify(rows === 0 ? 'Aucune transaction à exporter' : agreed(rows, 'transaction', 'exportée'))
    }))
  }

  const importCsv = () => {
    chooseFileToOpen(parent, {
      title: 'Importer des transactions',
      ...CSV_FILTER,
    }, (filePath) => run(() => {
      notify(describeCsvImport(importTransactionsCsv(filePath, stores)))
    }))
  }

  const backupGroup = new Adw.PreferencesGroup({
    title: 'Sauvegarde complète',
    description: 'Un fichier JSON contenant les catégories, les seuils, '
      + 'les récurrences et tous les mois de l’historique.',
  })
  backupGroup.add(createActionRow({
    title: 'Exporter une sauvegarde',
    subtitle: 'Enregistrer l’état actuel dans un fichier',
    buttonLabel: 'Exporter…',
    iconName: 'document-save-symbolic',
    onClick: exportArchive,
  }))
  backupGroup.add(createActionRow({
    title: 'Importer une sauvegarde',
    subtitle: 'Restaurer un fichier, en remplaçant ou en fusionnant',
    buttonLabel: 'Importer…',
    iconName: 'document-open-symbolic',
    onClick: importArchive,
  }))

  const csvGroup = new Adw.PreferencesGroup({
    title: 'Tableur (CSV)',
    description: 'Colonnes date, description, catégorie, type et montant, '
      + 'séparées par des points-virgules — lisibles dans Excel ou LibreOffice.',
  })
  csvGroup.add(createActionRow({
    title: 'Exporter les transactions',
    subtitle: 'Tous les mois, du plus ancien au plus récent',
    buttonLabel: 'Exporter…',
    iconName: 'x-office-spreadsheet-symbolic',
    onClick: exportCsv,
  }))
  csvGroup.add(createActionRow({
    title: 'Importer des transactions',
    subtitle: 'Chaque ligne rejoint le mois de sa date et s’ajoute aux transactions existantes',
    buttonLabel: 'Importer…',
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
  const parts = [
    `${months} mois`,
    plural(transactions, 'transaction'),
    plural(categories, 'catégorie'),
  ]
  if (recurrences > 0) parts.push(plural(recurrences, 'récurrence'))
  return parts.join(', ')
}

function describeImport(mode: ImportMode, counts: BackupCounts): string {
  if (mode === 'replace') return `Sauvegarde restaurée — ${describe(counts)}`

  const { transactions, categories, recurrences } = counts
  if (transactions === 0 && categories === 0 && recurrences === 0) {
    return 'Rien à ajouter : ces données sont déjà présentes'
  }

  const parts: string[] = []
  if (transactions > 0) parts.push(plural(transactions, 'transaction'))
  if (categories > 0) parts.push(plural(categories, 'catégorie'))
  if (recurrences > 0) parts.push(plural(recurrences, 'récurrence'))
  return `Fusion terminée — ajout de ${parts.join(', ')}`
}

function describeCsvImport({ imported, ignored, months, categories }: CsvImportReport): string {
  let message = `${agreed(imported, 'transaction', 'importée')} dans ${months} mois`
  if (categories > 0) message += `, ${agreed(categories, 'catégorie', 'créée')}`
  if (ignored > 0) message += ` — ${agreed(ignored, 'ligne', 'ignorée')}`
  return message
}

/** French plural: "mois" is already invariable, every other noun takes an "s". */
function plural(count: number, noun: string): string {
  return `${count} ${count > 1 ? `${noun}s` : noun}`
}

/** Same, with a past participle that has to agree: "3 lignes ignorées". */
function agreed(count: number, noun: string, participle: string): string {
  return `${plural(count, noun)} ${participle}${count > 1 ? 's' : ''}`
}
