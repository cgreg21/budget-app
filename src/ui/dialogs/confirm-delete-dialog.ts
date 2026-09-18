/*
 * ui/dialogs/confirm-delete-dialog.ts — "supprimer « … » ?"
 *
 * The single gate in front of every delete button in the app. A budget has no
 * undo, and a trash icon sits one pixel away from the edit one in each row, so
 * a misplaced click would otherwise cost data for good.
 *
 * Callers name what is about to go — the very label the row shows, so there is
 * no doubt about which one was hit — and describe what the deletion actually
 * does. That second part matters here: none of the three deletions are alike.
 * A category leaves its transactions behind, a recurrence keeps the
 * occurrences it already created, and deleting one of those occurrences only
 * clears it until the month is opened again.
 */
import Adw from 'gi:Adw-1'

import { t } from '../../i18n/index.js'
import type { GtkWidget } from '../gtk-types.js'

const CANCEL = 'cancel'
const DELETE = 'delete'

export interface ConfirmDeleteDialogOptions {
  /** The thing about to go, quoted in the heading — normally the row's title. */
  name: string
  /** What the deletion takes, and what it spares. */
  body: string
  onConfirm(): void
}

export function openConfirmDeleteDialog(
  parent: GtkWidget,
  { name, body, onConfirm }: ConfirmDeleteDialogOptions,
): void {
  const dialog = new Adw.AlertDialog({
    heading: t().confirmDeleteDialog.heading(name),
    body,
  })

  dialog.addResponse(CANCEL, t().common.cancel)
  dialog.addResponse(DELETE, t().common.delete)
  dialog.setResponseAppearance(DELETE, Adw.ResponseAppearance.DESTRUCTIVE)
  // Cancelling is both the default and the answer to Escape: a stray Enter on
  // a dialog that was not even read must never delete anything.
  dialog.setDefaultResponse(CANCEL)
  dialog.setCloseResponse(CANCEL)

  dialog.on('response', (response) => {
    if (response === DELETE) onConfirm()
  })

  dialog.present(parent)
}
