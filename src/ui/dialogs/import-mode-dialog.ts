/*
 * ui/dialogs/import-mode-dialog.ts — "remplacer, ou fusionner ?"
 *
 * Asked once the archive has been read and described, because the same file
 * can mean two very different things: starting again from a backup, or
 * bringing back what is missing. Replacing is destructive — it is marked as
 * such and is never the default answer.
 */
import Adw from 'gi:Adw-1'

import type { ImportMode } from '../../domain/backup.js'
import type { GtkWidget } from '../gtk-types.js'

const CANCEL = 'cancel'
const MERGE = 'merge'
const REPLACE = 'replace'

export interface ImportModeDialogOptions {
  /** What the file holds, e.g. "3 mois, 42 transactions, 8 catégories". */
  summary: string
  onChoose(mode: ImportMode): void
}

export function openImportModeDialog(
  parent: GtkWidget,
  { summary, onChoose }: ImportModeDialogOptions,
): void {
  const dialog = new Adw.AlertDialog({
    heading: 'Importer la sauvegarde',
    body: `Cette sauvegarde contient ${summary}.\n\n`
      + 'Fusionner ajoute seulement ce qui manque et conserve les données actuelles. '
      + 'Remplacer efface les données actuelles — mois, catégories, seuils et récurrences — '
      + 'au profit de celles du fichier.',
  })

  dialog.addResponse(CANCEL, 'Annuler')
  dialog.addResponse(MERGE, 'Fusionner')
  dialog.addResponse(REPLACE, 'Remplacer')
  dialog.setResponseAppearance(MERGE, Adw.ResponseAppearance.SUGGESTED)
  dialog.setResponseAppearance(REPLACE, Adw.ResponseAppearance.DESTRUCTIVE)
  dialog.setDefaultResponse(MERGE)
  dialog.setCloseResponse(CANCEL)

  dialog.on('response', (response) => {
    if (response === MERGE) onChoose('merge')
    else if (response === REPLACE) onChoose('replace')
  })

  dialog.present(parent)
}
