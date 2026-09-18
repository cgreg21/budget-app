/*
 * ui/dialogs/edit-scope-dialog.ts — "cette occurrence, ou toute la série ?"
 *
 * Asked whenever a transaction that belongs to a recurrence is saved, because
 * only the user knows whether the change is a one-off correction or a new rule.
 * Changing the frequency is the exception: a rhythm belongs to the series, so
 * the per-occurrence answer is then out of reach.
 */
import Adw from 'gi:Adw-1'

import { t } from '../../i18n/index.js'
import type { GtkWidget } from '../gtk-types.js'

const CANCEL = 'cancel'
const OCCURRENCE = 'occurrence'
const SERIES = 'series'

export interface EditScopeDialogOptions {
  /** False when the repetition itself changed — that can only apply to the series. */
  canApplyToOccurrence: boolean
  onOccurrence(): void
  onSeries(): void
}

export function openEditScopeDialog(
  parent: GtkWidget,
  { canApplyToOccurrence, onOccurrence, onSeries }: EditScopeDialogOptions,
): void {
  const dialog = new Adw.AlertDialog({
    heading: t().editScopeDialog.heading,
    body: canApplyToOccurrence
      ? t().editScopeDialog.bodyOccurrence
      : t().editScopeDialog.bodySeriesOnly,
  })

  dialog.addResponse(CANCEL, t().common.cancel)
  dialog.addResponse(OCCURRENCE, t().editScopeDialog.occurrenceOption)
  dialog.addResponse(SERIES, t().editScopeDialog.seriesOption)
  dialog.setResponseEnabled(OCCURRENCE, canApplyToOccurrence)
  dialog.setResponseAppearance(SERIES, Adw.ResponseAppearance.SUGGESTED)
  dialog.setDefaultResponse(canApplyToOccurrence ? OCCURRENCE : SERIES)
  dialog.setCloseResponse(CANCEL)

  dialog.on('response', (response) => {
    if (response === OCCURRENCE) onOccurrence()
    else if (response === SERIES) onSeries()
  })

  dialog.present(parent)
}
