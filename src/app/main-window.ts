/*
 * app/main-window.ts — the application window: header bar on top, toast
 * overlay wrapping the budget view underneath.
 *
 * The header switches between the budget and history pages, opens the main
 * menu, and carries the "add" button; the month navigator lives inside the
 * budget page itself (see ui/views/budget-view.ts), since it makes no sense
 * on the history page.
 *
 * Adw.ApplicationWindow has no built-in title bar, so the header is stacked
 * above the content inside a vertical box.
 */
import Gtk from 'gi:Gtk-4.0'
import Gio from 'gi:Gio-2.0'
import Adw from 'gi:Adw-1'
import Gdk from 'gi:Gdk-4.0'

import type { BudgetStore } from '../data/budget-store.js'
import type { CategoryStore } from '../data/category-store.js'
import type { GeneralSettingsStore } from '../data/general-settings-store.js'
import type { RecurrenceStore } from '../data/recurrence-store.js'
import type { RemoteStorage } from '../data/remote/remote-storage.js'
import type { ThresholdsStore } from '../data/thresholds-store.js'
import { isWritable } from '../domain/remote.js'
import { t } from '../i18n/index.js'
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
import { createHistoryView } from '../ui/views/history-view.js'
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
  generalSettingsStore: GeneralSettingsStore
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
  onShowBudget(): void
  onShowHistory(): void
  isBudgetPage(): boolean
}

function createMainMenu(): GioMenu {
  const menu = new Gio.Menu()
  menu.append(t().mainWindow.optionsMenu, 'app.options')
  menu.append(t().mainWindow.aboutMenu(APP_NAME), 'app.about')
  menu.append(t().mainWindow.quitMenu, 'app.quit')
  return menu
}

interface OptionsActionDeps {
  application: AdwApplication
  window: AdwApplicationWindow
  budgetStore: BudgetStore
  categoryStore: CategoryStore
  thresholdsStore: ThresholdsStore
  recurrenceStore: RecurrenceStore
  generalSettingsStore: GeneralSettingsStore
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
  generalSettingsStore,
  remoteStorage,
}: OptionsActionDeps): void {
  const action = Gio.SimpleAction.new('options', null)
  action.on('activate', () => openOptionsDialog(window, {
    budgetStore,
    categoryStore,
    thresholdsStore,
    recurrenceStore,
    generalSettingsStore,
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
  onShowBudget,
  onShowHistory,
  isBudgetPage,
}: HeaderBarDeps): DisposableComponent {
  const header = new Adw.HeaderBar()
  const guard = createWriteGuard(notify)

  const addTransaction = () => {
    if (!isWritable(remoteStorage.status)) return
    openTransactionDialog(parent, {
      categories: categoryStore.categories,
      defaultDate: budgetStore.defaultTransactionDate,
      onSubmit: ({ input, recurrence }) => guard(() => {
        if (recurrence === null) {
          budgetStore.add(input)
          notify(t().mainWindow.added)
          return
        }
        budgetStore.addRecurring(input, recurrence)
        notify(t().mainWindow.addedRecurring)
      }),
    })
  }

  const addButton = new Gtk.Button({
    iconName: 'list-add-symbolic',
    label: t().common.add,
    tooltipText: t().mainWindow.addTransactionTooltip,
    cssClasses: ['add-transaction-button'],
  })
  addButton.on('clicked', addTransaction)

  const keyController = new Gtk.EventControllerKey({
    propagationPhase: Gtk.PropagationPhase.CAPTURE,
  })
  keyController.on('key-pressed', (keyval) => {
    if (keyval !== Gdk.KEY_Tab || !isBudgetPage()) return false
    addTransaction()
    return true
  })
  header.addController(keyController)

  const budgetButton = createIconButton({
    iconName: 'view-grid-symbolic',
    tooltip: t().mainWindow.budgetMenu,
    onClick: () => {
      addButton.setVisible(true)
      budgetButton.setCssClasses(['page-switcher', 'page-button-active'])
      historyButton.setCssClasses(['page-switcher'])
      onShowBudget()
    },
  })
  const historyButton = createIconButton({
    iconName: 'view-list-symbolic',
    tooltip: t().mainWindow.historyMenu,
    onClick: () => {
      addButton.setVisible(false)
      budgetButton.setCssClasses(['page-switcher'])
      historyButton.setCssClasses(['page-switcher', 'page-button-active'])
      onShowHistory()
    },
  })
  budgetButton.setCssClasses(['page-switcher', 'page-button-active'])
  header.packStart(budgetButton)
  header.packStart(historyButton)
  header.packEnd(new Gtk.MenuButton({
    iconName: 'open-menu-symbolic',
    menuModel: createMainMenu(),
    primary: true,
  }))
  header.packEnd(addButton)

  const render = () => {
    // Nothing can be added while the server that holds the budget is silent.
    const writable = isWritable(remoteStorage.status)
    addButton.setSensitive(writable)
    addButton.setTooltipText(writable
      ? `${t().mainWindow.addTransactionTooltip} — ${formatMonth(budgetStore.selectedMonth)}`
      : t().mainWindow.serverUnreachable)
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
  generalSettingsStore,
  remoteStorage,
}: MainWindowDeps): MainWindow {
  const window = new Adw.ApplicationWindow({ application })
  window.setTitle(APP_NAME)
  //window.setDefaultSize(WINDOW_WIDTH, WINDOW_HEIGHT)

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

  const historyView = createHistoryView()
  const pages = new Gtk.Stack({ vexpand: true })
  pages.addNamed(toasts, 'budget')
  pages.addNamed(historyView.widget, 'history')
  const showBudget = () => pages.setVisibleChildName('budget')
  const showHistory = () => {
    historyView.update(budgetStore.monthlyTotals)
    pages.setVisibleChildName('history')
  }
  historyView.update(budgetStore.monthlyTotals)
  const unsubscribeHistory = budgetStore.onChange(() => historyView.update(budgetStore.monthlyTotals))

  const header = createHeaderBar({
    parent: window,
    budgetStore,
    categoryStore,
    remoteStorage,
    notify,
    onShowBudget: showBudget,
    onShowHistory: showHistory,
    isBudgetPage: () => pages.getVisibleChildName() === 'budget',
  })

  registerOptionsAction({
    application,
    window,
    budgetStore,
    categoryStore,
    thresholdsStore,
    recurrenceStore,
    generalSettingsStore,
    remoteStorage,
  })

  // Says out loud why the budget suddenly refuses to be edited, and offers
  // the one action that can fix it.
  const banner = new Adw.Banner({ buttonLabel: t().mainWindow.retryButton })
  banner.on('button-clicked', () => {
    void remoteStorage.connect()
  })
  const showBanner = () => {
    const { status } = remoteStorage
    banner.setRevealed(!isWritable(status))
    banner.setTitle(status.state === 'connecting'
      ? t().remoteStatus.connecting
      : t().mainWindow.serverUnreachable)
  }
  showBanner()
  const unsubscribeBanner = remoteStorage.onStatusChange(showBanner)

  const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
  content.append(header.widget)
  content.append(banner)
  content.append(pages)
  window.setContent(content)

  return {
    window,
    dispose: () => {
      unsubscribeBanner()
      header.dispose()
      budgetView.dispose()
      unsubscribeHistory()
    },
  }
}
