/*
 * ui/dialogs/config-import-dialog.ts — "appliquer cette configuration ?"
 *
 * Asked once the file has been decrypted and described: the user sees which
 * sections it carries — and whether secrets are among them — before the
 * current settings are replaced.
 */
import Adw from 'gi:Adw-1'

import { t } from '../../i18n/index.js'
import type { GtkWidget } from '../gtk-types.js'

const CANCEL = 'cancel'
const IMPORT = 'import'

export interface ConfigImportDialogOptions {
  /** What the file holds, e.g. "les préférences générales, les seuils, le compte de l'agenda". */
  summary: string
  onConfirm(): void
}

export function openConfigImportDialog(
  parent: GtkWidget,
  { summary, onConfirm }: ConfigImportDialogOptions,
): void {
  const strings = t().configGroup
  const dialog = new Adw.AlertDialog({
    heading: strings.importHeading,
    body: strings.importBody(summary),
  })

  dialog.addResponse(CANCEL, t().common.cancel)
  dialog.addResponse(IMPORT, strings.importButton)
  dialog.setResponseAppearance(IMPORT, Adw.ResponseAppearance.SUGGESTED)
  dialog.setDefaultResponse(IMPORT)
  dialog.setCloseResponse(CANCEL)

  dialog.on('response', (response) => {
    if (response === IMPORT) onConfirm()
  })

  dialog.present(parent)
}
