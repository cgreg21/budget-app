/*
 * ui/dialogs/security-group.ts — the "app lock" section of the options dialog:
 * set, change or remove the PIN.
 *
 * Changing or removing the PIN asks for the current one first. The PIN only
 * gates the window; the section's description says the data stays unencrypted.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import { LockService, MAX_PIN_LENGTH, MIN_PIN_LENGTH } from '../../data/lock-service.js'
import { t } from '../../i18n/index.js'
import type { AdwPreferencesGroup, GtkWidget } from '../gtk-types.js'
import type { Notify } from '../types.js'
import { onNotify } from '../widgets.js'

const CANCEL = 'cancel'
const CONFIRM = 'confirm'

interface PinDialogOptions {
  heading: string
  body: string
  confirmLabel: string
  destructive?: boolean
  askCurrent: boolean
  askNew: boolean
  onSubmit(current: string, next: string): void
}

function openPinDialog(parent: GtkWidget, options: PinDialogOptions): void {
  const strings = t().lock
  const dialog = new Adw.AlertDialog({ heading: options.heading, body: options.body })

  const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['boxed-list'] })
  const currentRow = options.askCurrent ? new Adw.PasswordEntryRow({ title: strings.currentPinLabel }) : null
  const nextRow = options.askNew ? new Adw.PasswordEntryRow({ title: strings.newPinLabel }) : null
  const confirmRow = options.askNew ? new Adw.PasswordEntryRow({ title: strings.confirmPinLabel }) : null
  for (const row of [currentRow, nextRow, confirmRow]) if (row) list.append(row)

  const hint = new Gtk.Label({ xalign: 0, wrap: true, cssClasses: ['caption', 'dim-label'] })
  const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  content.append(list)
  content.append(hint)
  dialog.setExtraChild(content)

  dialog.addResponse(CANCEL, t().common.cancel)
  dialog.addResponse(CONFIRM, options.confirmLabel)
  dialog.setResponseAppearance(CONFIRM, options.destructive ? Adw.ResponseAppearance.DESTRUCTIVE : Adw.ResponseAppearance.SUGGESTED)
  dialog.setDefaultResponse(CONFIRM)
  dialog.setCloseResponse(CANCEL)

  const refresh = () => {
    let ok = true
    let message = ''
    if (nextRow && confirmRow) {
      if (!LockService.isValidPin(nextRow.text)) {
        ok = false
        message = strings.pinRule(MIN_PIN_LENGTH, MAX_PIN_LENGTH)
      } else if (nextRow.text !== confirmRow.text) {
        ok = false
        message = strings.pinMismatch
      }
    }
    if (currentRow && currentRow.text === '') ok = false
    hint.setLabel(nextRow && nextRow.text !== '' ? message : '')
    dialog.setResponseEnabled(CONFIRM, ok)
  }
  for (const row of [currentRow, nextRow, confirmRow]) if (row) onNotify(row, 'text', refresh)
  refresh()

  dialog.on('response', (response) => {
    if (response === CONFIRM) options.onSubmit(currentRow?.text ?? '', nextRow?.text ?? '')
  })

  dialog.present(parent)
  ;(currentRow ?? nextRow)?.grabFocus()
}

export interface SecurityGroupOptions {
  lockService: LockService
  parent: GtkWidget
  notify: Notify
}

export interface SecurityGroup {
  group: AdwPreferencesGroup
  dispose(): void
}

export function createSecurityGroup({ lockService, parent, notify }: SecurityGroupOptions): SecurityGroup {
  const strings = t().lock
  const group = new Adw.PreferencesGroup({
    title: strings.groupTitle,
    description: strings.groupDescription(MIN_PIN_LENGTH, MAX_PIN_LENGTH),
  })
  const statusRow = new Adw.ActionRow({ title: strings.statusDisabled })
  const setButton = new Gtk.Button({ label: strings.setPinButton, valign: Gtk.Align.CENTER })
  const changeButton = new Gtk.Button({ label: strings.changePinButton, valign: Gtk.Align.CENTER })
  const removeButton = new Gtk.Button({ label: strings.removePinButton, valign: Gtk.Align.CENTER, cssClasses: ['destructive-action'] })
  for (const button of [setButton, changeButton, removeButton]) statusRow.addSuffix(button)
  group.add(statusRow)

  const failed = () => notify(strings.operationFailed)

  const checkCurrent = async (current: string): Promise<boolean> => {
    if (await lockService.verify(current)) return true
    notify(strings.wrongCurrentPin)
    return false
  }

  setButton.on('clicked', () => openPinDialog(parent, {
    heading: strings.setPinHeading,
    body: strings.pinRule(MIN_PIN_LENGTH, MAX_PIN_LENGTH),
    confirmLabel: t().common.save,
    askCurrent: false,
    askNew: true,
    onSubmit: (_current, next) => {
      lockService.setPin(next).then(() => notify(strings.pinSet), failed)
    },
  }))

  changeButton.on('clicked', () => openPinDialog(parent, {
    heading: strings.changePinHeading,
    body: strings.pinRule(MIN_PIN_LENGTH, MAX_PIN_LENGTH),
    confirmLabel: t().common.save,
    askCurrent: true,
    askNew: true,
    onSubmit: (current, next) => {
      checkCurrent(current)
        .then(async (ok) => {
          if (!ok) return
          await lockService.setPin(next)
          notify(strings.pinChanged)
        })
        .catch(failed)
    },
  }))

  removeButton.on('clicked', () => openPinDialog(parent, {
    heading: strings.removePinHeading,
    body: strings.removePinBody,
    confirmLabel: t().common.delete,
    destructive: true,
    askCurrent: true,
    askNew: false,
    onSubmit: (current) => {
      checkCurrent(current)
        .then((ok) => {
          if (!ok) return
          lockService.disable()
          notify(strings.pinRemoved)
        })
        .catch(failed)
    },
  }))

  const render = () => {
    const enabled = lockService.enabled
    statusRow.setTitle(enabled ? strings.statusEnabled : strings.statusDisabled)
    setButton.setVisible(!enabled)
    changeButton.setVisible(enabled)
    removeButton.setVisible(enabled)
  }
  render()
  const unsubscribe = lockService.onChange(render)

  return { group, dispose: unsubscribe }
}
