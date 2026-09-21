/*
 * app/application.ts — application lifecycle: stores, window, actions and
 * a single shutdown path.
 *
 * node-gtk integrates the GTK main loop with Node's event loop automatically,
 * but under ESM the blocking run calls (`loop.run()` / `app.run()`) return
 * immediately instead of blocking, so teardown is driven by `shutdown()`
 * rather than by the loop returning.
 * See https://github.com/romgrk/node-gtk/blob/master/doc/importing.md
 */
import GLib from 'gi:GLib-2.0'
import Gio from 'gi:Gio-2.0'
import Adw from 'gi:Adw-1'

import { styles } from 'node-gtk/styles'

import { BudgetStore } from '../data/budget-store.js'
import { CategoryStore } from '../data/category-store.js'
import { RecurrenceStore } from '../data/recurrence-store.js'
import { GeneralSettingsStore } from '../data/general-settings-store.js'
import { setRemoteGateway } from '../data/remote/gateway.js'
import { RemoteConfigStore } from '../data/remote/remote-config-store.js'
import { RemoteStorage } from '../data/remote/remote-storage.js'
import { ThresholdsStore } from '../data/thresholds-store.js'
import { openAboutDialog } from '../ui/dialogs/about-dialog.js'
import type { AdwApplication, AdwApplicationWindow } from '../ui/gtk-types.js'
import { APP_ID } from './app-info.js'
import { createMainWindow } from './main-window.js'
import { setLocale } from '../i18n/index.js'
import { configureDisplaySettings } from '../ui/format.js'
import { applyTheme } from '../ui/theme.js'

export interface ApplicationOptions {
  /** Custom stylesheet layered on top of Adwaita; hot-reloaded by `npm run dev`. */
  stylesheet: URL
}

interface ActionDeps {
  application: AdwApplication
  window: AdwApplicationWindow
  quit: () => void
}

function registerActions({ application, window, quit }: ActionDeps): void {
  const aboutAction = Gio.SimpleAction.new('about', null)
  aboutAction.on('activate', () => openAboutDialog(window))
  application.addAction(aboutAction)

  const quitAction = Gio.SimpleAction.new('quit', null)
  quitAction.on('activate', quit)
  application.addAction(quitAction)
  application.setAccelsForAction('app.quit', ['<Control>q'])
}

export function runApplication({ stylesheet }: ApplicationOptions): void {
  const loop = GLib.MainLoop.new(null, false)
  const application = new Adw.Application({
    applicationId: APP_ID,
    flags: Gio.ApplicationFlags.FLAGS_NONE,
  })

  application.on('activate', () => {
    styles.addFile(stylesheet)

    const remoteConfigStore = new RemoteConfigStore()
    const remoteStorage = new RemoteStorage({
      configStore: remoteConfigStore,
      // The pull rewrites the month files behind the stores' backs; only a
      // full reload notices the months it added or removed.
      onSynced: () => budgetStore.reload(),
    })
    // Installed before any store exists, so the very first write is already
    // subject to it.
    setRemoteGateway(remoteStorage)

    const recurrenceStore = new RecurrenceStore()
    const generalSettingsStore = new GeneralSettingsStore()
    setLocale(generalSettingsStore.settings.language)
    configureDisplaySettings(generalSettingsStore.settings)
    applyTheme(generalSettingsStore.settings.theme)
    // The budget store replays the recurrences into every month it opens.
    const budgetStore = new BudgetStore(recurrenceStore)
    const categoryStore = new CategoryStore()
    const thresholdsStore = new ThresholdsStore()
    const mainWindow = createMainWindow({
      application,
      budgetStore,
      categoryStore,
      thresholdsStore,
      recurrenceStore,
      generalSettingsStore,
      remoteStorage,
    })

    let stopped = false
    const shutdown = () => {
      if (stopped) return // the quit action and close-request can both fire
      stopped = true
      mainWindow.dispose()
      budgetStore.dispose()
      categoryStore.dispose()
      thresholdsStore.dispose()
      recurrenceStore.dispose()
      generalSettingsStore.dispose()
      setRemoteGateway(null)
      remoteStorage.dispose()
      remoteConfigStore.dispose()
      loop.quit()
      application.quit()
    }

    registerActions({ application, window: mainWindow.window, quit: shutdown })
    mainWindow.window.on('close-request', () => {
      shutdown()
      return false // let the window close
    })

    styles.install() // flush queued styles and start the dev hot-reload watcher
    mainWindow.window.present()

    // Deliberately not awaited: the window opens at once on the cached budget,
    // and the server's version replaces it as soon as it arrives. Waiting for
    // a network round trip before showing anything would make a slow
    // connection look like a broken application.
    void remoteStorage.connect()

    loop.run() // returns immediately under ESM — see the note above
  })

  application.run([])
}
