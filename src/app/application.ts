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
import GObject from 'gi:GObject-2.0'
import Adw from 'gi:Adw-1'

import { styles } from 'node-gtk/styles'

import { BankKeyStore } from '../data/bank/bank-key-store.js'
import { BankService } from '../data/bank/bank-service.js'
import { BankStateStore } from '../data/bank/bank-state-store.js'
import { BudgetStore } from '../data/budget-store.js'
import { CalendarSyncService } from '../data/calendar/calendar-sync-service.js'
import { CategoryStore } from '../data/category-store.js'
import { ConfigArchiveService } from '../data/config-archive-service.js'
import { RecurrenceStore } from '../data/recurrence-store.js'
import { GeneralSettingsStore } from '../data/general-settings-store.js'
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

    const recurrenceStore = new RecurrenceStore()
    const generalSettingsStore = new GeneralSettingsStore()
    setLocale(generalSettingsStore.settings.language)
    configureDisplaySettings(generalSettingsStore.settings)
    applyTheme(generalSettingsStore.settings.theme)
    // The budget store replays the recurrences into every month it opens.
    const budgetStore = new BudgetStore(recurrenceStore)
    const categoryStore = new CategoryStore()
    const thresholdsStore = new ThresholdsStore()
    const bankStateStore = new BankStateStore()
    const bankKeyStore = new BankKeyStore()
    const bankService = new BankService({
      state: bankStateStore,
      keys: bankKeyStore,
      categories: () => categoryStore.categories,
      importTransactions: (transactions) => budgetStore.importTransactions(transactions),
      openUrl: (url) => Gio.AppInfo.launchDefaultForUri(url, null),
      language: () => generalSettingsStore.settings.language,
    })
    const calendarSyncService = new CalendarSyncService({ budgetStore, categoryStore })
    const configArchive = new ConfigArchiveService({
      general: generalSettingsStore,
      thresholds: thresholdsStore,
      calendar: calendarSyncService,
      bankState: bankStateStore,
      bankKeys: bankKeyStore,
    })
    const mainWindow = createMainWindow({
      application,
      budgetStore,
      categoryStore,
      thresholdsStore,
      recurrenceStore,
      generalSettingsStore,
      bankService,
      calendarSyncService,
      configArchive,
    })

    const networkMonitor = Gio.NetworkMonitor.getDefault()
    const onNetworkChanged = (available: boolean) => {
      if (available) calendarSyncService.resume()
    }
    // The generated NetworkMonitor interface omits its GObject signal API.
    if (networkMonitor instanceof GObject.Object) networkMonitor.on('network-changed', onNetworkChanged)

    let stopped = false
    const shutdown = () => {
      if (stopped) return // the quit action and close-request can both fire
      stopped = true
      mainWindow.dispose()
      bankService.dispose()
      if (networkMonitor instanceof GObject.Object) networkMonitor.off('network-changed', onNetworkChanged)
      calendarSyncService.dispose()
      bankStateStore.dispose()
      budgetStore.dispose()
      categoryStore.dispose()
      thresholdsStore.dispose()
      recurrenceStore.dispose()
      generalSettingsStore.dispose()
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

    bankService.start()
    calendarSyncService.start()

    loop.run() // returns immediately under ESM — see the note above
  })

  application.run([])
}
