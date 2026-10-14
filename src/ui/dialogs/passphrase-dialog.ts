/*
 * ui/dialogs/passphrase-dialog.ts — asking for the passphrase of an encrypted
 * configuration file.
 *
 * Sealing a file asks for it twice, with the rule shown as the user types:
 * too short, or the two entries differ, and the confirm button stays off.
 * Opening a file asks once — the file itself tells whether it was right.
 * The entries hide what is typed; the eye icon reveals it on demand.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import { t } from '../../i18n/index.js'
import type { GtkWidget } from '../gtk-types.js'
import { checkPassphrase, MIN_PASSPHRASE_LENGTH } from '../passphrase.js'
import { onNotify } from '../widgets.js'

const CANCEL = 'cancel'
const CONFIRM = 'confirm'

export interface PassphraseDialogOptions {
  heading: string
  body: string
  confirmLabel: string
  /** Ask to type the passphrase twice (when creating a file). */
  confirm: boolean
  onEntered(passphrase: string): void
}

export function openPassphraseDialog(
  parent: GtkWidget,
  { heading, body, confirmLabel, confirm, onEntered }: PassphraseDialogOptions,
): void {
  const strings = t().configGroup
  const dialog = new Adw.AlertDialog({ heading, body })

  const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['boxed-list'] })
  const passphraseRow = new Adw.PasswordEntryRow({ title: strings.passphraseLabel })
  list.append(passphraseRow)
  const confirmationRow = confirm ? new Adw.PasswordEntryRow({ title: strings.confirmPassphraseLabel }) : null
  if (confirmationRow) list.append(confirmationRow)

  const hint = new Gtk.Label({ xalign: 0, cssClasses: ['caption', 'dim-label'], wrap: true })
  const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  content.append(list)
  content.append(hint)
  dialog.setExtraChild(content)

  dialog.addResponse(CANCEL, t().common.cancel)
  dialog.addResponse(CONFIRM, confirmLabel)
  dialog.setResponseAppearance(CONFIRM, Adw.ResponseAppearance.SUGGESTED)
  dialog.setDefaultResponse(CONFIRM)
  dialog.setCloseResponse(CANCEL)

  const refresh = () => {
    const verdict = checkPassphrase(passphraseRow.text, confirmationRow?.text)
    dialog.setResponseEnabled(CONFIRM, verdict === 'ok')
    if (!confirm) hint.setLabel('')
    else if (verdict === 'too-short') hint.setLabel(strings.passphraseTooShort(MIN_PASSPHRASE_LENGTH))
    else if (verdict === 'mismatch') hint.setLabel(strings.passphraseMismatch)
    else hint.setLabel('')
  }
  onNotify(passphraseRow, 'text', refresh)
  if (confirmationRow) onNotify(confirmationRow, 'text', refresh)
  refresh()

  dialog.on('response', (response) => {
    if (response === CONFIRM) onEntered(passphraseRow.text)
  })

  dialog.present(parent)
  passphraseRow.grabFocus()
}
