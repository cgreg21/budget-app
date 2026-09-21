/*
 * ui/dialogs/form-dialog.ts — the shell shared by the "new / edit" forms:
 * a dialog with a header bar, "Annuler" on the left, the confirm button on the
 * right, and no close button — leaving is always an explicit choice.
 *
 * The dialog only closes once the form accepts the input, so an incomplete
 * entry keeps what the user typed.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'
import Gdk from 'gi:Gdk-4.0'

import { t } from '../../i18n/index.js'
import type { GtkWidget } from '../gtk-types.js'

const DEFAULT_WIDTH = 420
const DEFAULT_HEIGHT = 440

export interface FormDialogOptions {
  title: string
  confirmLabel: string
  content: GtkWidget
  /** Widget that receives focus once the dialog is presented. */
  initialFocus?: GtkWidget
  width?: number
  height?: number
  /** Returns false to keep the dialog open, e.g. when the form is incomplete. */
  onConfirm(): boolean
}

export function openFormDialog(
  parent: GtkWidget,
  {
    title,
    confirmLabel,
    content,
    initialFocus,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    onConfirm,
  }: FormDialogOptions,
): void {
  const dialog = new Adw.Dialog({
    title,
    contentWidth: width,
    contentHeight: height,
    focusWidget: initialFocus,
  })

  const header = new Adw.HeaderBar({ showStartTitleButtons: false, showEndTitleButtons: false })

  const cancelButton = new Gtk.Button({ label: t().common.cancel })
  cancelButton.on('clicked', () => dialog.close())
  header.packStart(cancelButton)

  const confirmButton = new Gtk.Button({ label: confirmLabel, cssClasses: ['suggested-action'] })
  const confirm = () => {
    if (onConfirm()) dialog.close()
  }
  confirmButton.on('clicked', confirm)

  const keyController = new Gtk.EventControllerKey({
    propagationPhase: Gtk.PropagationPhase.CAPTURE,
  })
  keyController.on('key-pressed', (keyval) => {
    if (keyval !== Gdk.KEY_Return && keyval !== Gdk.KEY_KP_Enter) return false
    confirm()
    return true
  })
  content.addController(keyController)
  header.packEnd(confirmButton)

  const toolbar = new Adw.ToolbarView()
  toolbar.addTopBar(header)
  toolbar.setContent(content)

  dialog.child = toolbar
  dialog.present(parent)
}
