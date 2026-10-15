/*
 * ui/views/lock-screen.ts — the page shown instead of the budget while the app
 * is locked: a PIN entry, an unlock button and the throttling countdown.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import type { LockService } from '../../data/lock-service.js'
import { t } from '../../i18n/index.js'
import type { DisposableComponent } from '../types.js'

export interface LockScreen extends DisposableComponent {
  /** Clears the entry and puts the focus in it; call when the screen is shown. */
  reset(): void
}

export function createLockScreen(lockService: LockService): LockScreen {
  const strings = t().lock
  const pinRow = new Adw.PasswordEntryRow({ title: strings.pinLabel })
  const list = new Gtk.ListBox({
    selectionMode: Gtk.SelectionMode.NONE,
    cssClasses: ['boxed-list'],
    widthRequest: 280,
  })
  list.append(pinRow)

  const message = new Gtk.Label({ cssClasses: ['error'], wrap: true })
  const unlockButton = new Gtk.Button({ label: strings.unlockButton, cssClasses: ['suggested-action', 'pill'], halign: Gtk.Align.CENTER })

  const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, halign: Gtk.Align.CENTER })
  content.append(list)
  content.append(message)
  content.append(unlockButton)

  const page = new Adw.StatusPage({
    iconName: 'system-lock-screen-symbolic',
    title: strings.title,
    description: strings.description,
    vexpand: true,
  })
  page.setChild(content)

  const toolbar = new Adw.ToolbarView()
  toolbar.addTopBar(new Adw.HeaderBar())
  toolbar.setContent(page)

  let timer: NodeJS.Timeout | undefined
  const stopTimer = () => {
    if (timer) clearInterval(timer)
    timer = undefined
  }

  const refreshBlocked = () => {
    const remaining = Math.ceil((lockService.blockedUntil - Date.now()) / 1000)
    if (remaining > 0) {
      message.setLabel(strings.blocked(remaining))
      unlockButton.setSensitive(false)
      return
    }
    stopTimer()
    message.setLabel('')
    unlockButton.setSensitive(true)
  }

  const watchBlocked = () => {
    stopTimer()
    if (lockService.blockedUntil === 0) return
    refreshBlocked()
    timer = setInterval(refreshBlocked, 1000)
  }

  const attempt = async () => {
    const pin = pinRow.text
    if (pin === '' || lockService.blockedUntil > 0) return
    const unlocked = await lockService.unlock(pin)
    pinRow.text = ''
    if (unlocked) return
    message.setLabel(strings.wrongPin)
    watchBlocked()
  }

  pinRow.on('entry-activated', () => void attempt())
  unlockButton.on('clicked', () => void attempt())

  return {
    widget: toolbar,
    reset: () => {
      pinRow.text = ''
      message.setLabel('')
      unlockButton.setSensitive(true)
      watchBlocked()
      pinRow.grabFocus()
    },
    dispose: stopTimer,
  }
}
