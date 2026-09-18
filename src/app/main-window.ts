/*
 * app/main-window.ts — the application window: header bar on top, toast
 * overlay wrapping the budget view underneath.
 *
 * The header bar carries the month navigator as its title, so browsing the
 * history — or any month ahead — is always one click away. Every month can be
 * edited: the "add" button files the new transaction into the month currently
 * on screen. Everything else — options, about, quit — lives in the main menu.
 *
 * Adw.ApplicationWindow has no built-in title bar, so the header is stacked
 * above the content inside a vertical box.
 */
import Gtk from 'gi:Gtk-4.0'
import Gio from 'gi:Gio-2.0'
import Adw from 'gi:Adw-1'

import type { BudgetStore } from '../data/budget-store.js'
import type { CategoryStore } from '../data/category-store.js'
import type { RecurrenceStore } from '../data/recurrence-store.js'
import type { RemoteStorage } from '../data/remote/remote-storage.js'
import type { ThresholdsStore } from '../data/thresholds-store.js'
import { isWritable } from '../domain/remote.js'
import { openOptionsDialog } from '../ui/dialogs/options-dialog.js'
import { openTransactionDialog } from '../ui/dialogs/transaction-dialog.js'
import { formatMonth } from '../ui/format.js'
import type {
  AdwApplication,
  AdwApplicationWindow,
  GioMenu,
  GtkWidget,
} from '../ui/gtk-types.js'
import type { DisposableComponent, Notify } from '../ui/types.js'
import { createBudgetView } from '../ui/views/budget-view.js'
import { createMonthSwitcher } from '../ui/views/month-switcher.js'
import { createIconButton } from '../ui/widgets.js'
import { createWriteGuard } from '../ui/write-guard.js'
import { APP_NAME } from './app-info.js'

// Wide enough for the transaction list and the charts column side by side.
const WINDOW_WIDTH = 1000
const WINDOW_HEIGHT = 820

export interface MainWindowDeps {
  application: AdwApplication
  budgetStore: BudgetStore
  categoryStore: CategoryStore
  thresholdsStore: ThresholdsStore
  recurrenceStore: RecurrenceStore
  remoteStorage: RemoteStorage
}

export interface MainWindow {
  readonly window: AdwApplicationWindow
  /** Releases the store subscriptions held by the window's widgets. */
  dispose(): void
}

interface HeaderBarDeps {
  parent: GtkWidget
  budgetStore: BudgetStore
  categoryStore: CategoryStore
  remoteStorage: RemoteStorage
  notify: Notify
}

function createMainMenu(): GioMenu {
  const menu = new Gio.Menu()
  menu.append('Options', 'app.options')
  menu.append(`À propos de ${APP_NAME}`, 'app.about')
  menu.append('Quitter', 'app.quit')
  return menu
}

interface OptionsActionDeps {
  application: AdwApplication
  window: AdwApplicationWindow
  budgetStore: BudgetStore
  categoryStore: CategoryStore
  thresholdsStore: ThresholdsStore
  recurrenceStore: RecurrenceStore
  remoteStorage: RemoteStorage
}

/** The options entry lives in the main menu, so it is driven by an action. */
function registerOptionsAction({
  application,
  window,
  budgetStore,
  categoryStore,
  thresholdsStore,
  recurrenceStore,
  remoteStorage,
}: OptionsActionDeps): void {
  const action = Gio.SimpleAction.new('options', null)
  action.on('activate', () => openOptionsDialog(window, {
    budgetStore,
    categoryStore,
    thresholdsStore,
    recurrenceStore,
    remoteStorage,
    // Read on activation: a new recurrence starts from the month on screen.
    selectedMonth: budgetStore.selectedMonth,
  }))
  application.addAction(action)
}

function createHeaderBar({
  parent,
  budgetStore,
  categoryStore,
  remoteStorage,
  notify,
}: HeaderBarDeps): DisposableComponent {
  const header = new Adw.HeaderBar()
  const guard = createWriteGuard(notify)

  const monthSwitcher = createMonthSwitcher({
    onSelectOlder: () => budgetStore.selectOlderMonth(),
    onSelectNewer: () => budgetStore.selectNewerMonth(),
    onSelect: (month) => budgetStore.selectMonth(month),
  })
  header.setTitleWidget(monthSwitcher.widget)

  const addButton = createIconButton({
    iconName: 'list-add-symbolic',
    tooltip: 'Ajouter une transaction',
    onClick: () => {
      openTransactionDialog(parent, {
        categories: categoryStore.categories,
        defaultDate: budgetStore.defaultTransactionDate,
        onSubmit: ({ input, recurrence }) => guard(() => {
          if (recurrence === null) {
            budgetStore.add(input)
            notify('Transaction ajoutée')
            return
          }
          budgetStore.addRecurring(input, recurrence)
          notify('Transaction récurrente ajoutée')
        }),
      })
    },
  })
  header.packStart(addButton)

  header.packEnd(new Gtk.MenuButton({
    iconName: 'open-menu-symbolic',
    menuModel: createMainMenu(),
    primary: true,
  }))

  const render = () => {
    monthSwitcher.update({
      selected: budgetStore.selectedMonth,
      current: budgetStore.currentMonth,
      monthsWithData: budgetStore.monthsWithData,
      hasOlder: budgetStore.hasOlderMonth,
      hasNewer: budgetStore.hasNewerMonth,
    })

    // Nothing can be added while the server that holds the budget is silent.
    const writable = isWritable(remoteStorage.status)
    addButton.setSensitive(writable)
    addButton.setTooltipText(writable
      ? `Ajouter une transaction — ${formatMonth(budgetStore.selectedMonth)}`
      : 'Budget en lecture seule — serveur inaccessible')
  }

  render()
  const unsubscribeBudget = budgetStore.onChange(render)
  const unsubscribeRemote = remoteStorage.onStatusChange(render)

  return {
    widget: header,
    dispose: () => {
      unsubscribeBudget()
      unsubscribeRemote()
    },
  }
}

export function createMainWindow({
  application,
  budgetStore,
  categoryStore,
  thresholdsStore,
  recurrenceStore,
  remoteStorage,
}: MainWindowDeps): MainWindow {
  const window = new Adw.ApplicationWindow({ application })
  window.setTitle(APP_NAME)
  window.setDefaultSize(WINDOW_WIDTH, WINDOW_HEIGHT)

  const toasts = new Adw.ToastOverlay({ vexpand: true })
  const notify: Notify = (message) => toasts.addToast(new Adw.Toast({ title: message }))

  const budgetView = createBudgetView({
    parent: window,
    budgetStore,
    categoryStore,
    thresholdsStore,
    notify,
  })
  toasts.setChild(budgetView.widget)

  const header = createHeaderBar({
    parent: window,
    budgetStore,
    categoryStore,
    remoteStorage,
    notify,
  })

  registerOptionsAction({
    application,
    window,
    budgetStore,
    categoryStore,
    thresholdsStore,
    recurrenceStore,
    remoteStorage,
  })

  // Says out loud why the budget suddenly refuses to be edited, and offers
  // the one action that can fix it.
  const banner = new Adw.Banner({ buttonLabel: 'Réessayer' })
  banner.on('button-clicked', () => {
    void remoteStorage.connect()
  })
  const showBanner = () => {
    const { status } = remoteStorage
    banner.setRevealed(!isWritable(status))
    banner.setTitle(status.state === 'connecting'
      ? 'Connexion au serveur…'
      : 'Serveur inaccessible — budget en lecture seule')
  }
  showBanner()
  const unsubscribeBanner = remoteStorage.onStatusChange(showBanner)

  const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
  content.append(header.widget)
  content.append(banner)
  content.append(toasts)
  window.setContent(content)

  return {
    window,
    dispose: () => {
      unsubscribeBanner()
      header.dispose()
      budgetView.dispose()
    },
  }
}
