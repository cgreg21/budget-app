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

import type { BankService } from '../data/bank/bank-service.js'
import type { BudgetStore } from '../data/budget-store.js'
import type { CalendarSyncService } from '../data/calendar/calendar-sync-service.js'
import type { CategoryStore } from '../data/category-store.js'
import type { ConfigArchiveService } from '../data/config-archive-service.js'
import type { GeneralSettingsStore } from '../data/general-settings-store.js'
import type { LockService } from '../data/lock-service.js'
import type { RecurrenceStore } from '../data/recurrence-store.js'
import type { ThresholdsStore } from '../data/thresholds-store.js'
import { t } from '../i18n/index.js'
import { openOptionsDialog } from '../ui/dialogs/options-dialog.js'
import { openTransactionDialog } from '../ui/dialogs/transaction-dialog.js'
import { openTrashDialog } from '../ui/dialogs/trash-dialog.js'
import { describeCalendarState, formatCalendarLastSync, formatMonth } from '../ui/format.js'
import type {
  AdwApplication,
  AdwApplicationWindow,
  GioMenu,
  GtkWidget,
} from '../ui/gtk-types.js'
import type { DisposableComponent, Notify, NotifyAction } from '../ui/types.js'
import { createBudgetView } from '../ui/views/budget-view.js'
import { createHistoryView } from '../ui/views/history-view.js'
import { createLockScreen } from '../ui/views/lock-screen.js'
import { createIconButton } from '../ui/widgets.js'
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
  bankService: BankService
  calendarSyncService: CalendarSyncService
  configArchive: ConfigArchiveService
  lockService: LockService
}

export interface MainWindow {
  readonly window: AdwApplicationWindow
  /** Releases the store subscriptions held by the window's widgets. */
  dispose(): void
}

interface HeaderBarDeps {
  calendarSyncService: CalendarSyncService
  parent: GtkWidget
  budgetStore: BudgetStore
  categoryStore: CategoryStore
  notify: Notify
  onSyncRequested(): void
  onShowBudget(): void
  onShowHistory(): void
  isBudgetPage(): boolean
}

function createMainMenu(): GioMenu {
  const menu = new Gio.Menu()
  menu.append(t().trash.menu, 'app.trash')
  menu.append(t().lock.lockMenu, 'app.lock')
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
  bankService: BankService
  calendarSyncService: CalendarSyncService
  configArchive: ConfigArchiveService
  lockService: LockService
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
  bankService,
  calendarSyncService,
  configArchive,
  lockService,
}: OptionsActionDeps): void {
  const action = Gio.SimpleAction.new('options', null)
  action.on('activate', () => openOptionsDialog(window, {
    budgetStore,
    categoryStore,
    thresholdsStore,
    recurrenceStore,
    generalSettingsStore,
    bankService,
    calendarSyncService,
    configArchive,
    lockService,
    // Read on activation: a new recurrence starts from the month on screen.
    selectedMonth: budgetStore.selectedMonth,
  }))
  application.addAction(action)
}

function createHeaderBar({
  calendarSyncService,
  parent,
  budgetStore,
  categoryStore,
  notify,
  onSyncRequested,
  onShowBudget,
  onShowHistory,
  isBudgetPage,
}: HeaderBarDeps): DisposableComponent {
  const header = new Adw.HeaderBar()

  const addTransaction = () => {
    openTransactionDialog(parent, {
      categories: categoryStore.categories,
      defaultDate: budgetStore.defaultTransactionDate,
      onSubmit: ({ input, recurrence }) => {
        if (recurrence === null) {
          budgetStore.add(input)
          notify(t().mainWindow.added)
          return
        }
        budgetStore.addRecurring(input, recurrence)
        notify(t().mainWindow.addedRecurring)
      },
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
  const calendarIndicator = new Gtk.Button({ iconName: 'x-office-calendar-symbolic', cssClasses: ['flat'] })
  calendarIndicator.on('clicked', () => {
    onSyncRequested()
    void calendarSyncService.syncNow()
  })
  header.packEnd(calendarIndicator)
  const renderCalendar = () => {
    const status = calendarSyncService.status
    calendarIndicator.setVisible(calendarSyncService.config.enabled)
    calendarIndicator.setSensitive(status.state !== 'syncing')
    calendarIndicator.setIconName(status.state === 'error' || status.state === 'offline'
      ? 'dialog-warning-symbolic' : status.state === 'syncing' ? 'view-refresh-symbolic' : 'x-office-calendar-symbolic')
    calendarIndicator.setTooltipText([
      describeCalendarState(status.state), status.message,
      status.lastSync ? formatCalendarLastSync(status.lastSync) : t().calendarGroup.neverSynced,
      t().calendarGroup.syncButton,
    ].filter(Boolean).join('\n'))
  }
  renderCalendar()
  const unsubscribeCalendar = calendarSyncService.onStatusChange(renderCalendar)

  const render = () => {
    addButton.setTooltipText(`${t().mainWindow.addTransactionTooltip} — ${formatMonth(budgetStore.selectedMonth)}`)
  }

  render()
  const unsubscribeBudget = budgetStore.onChange(render)

  return {
    widget: header,
    dispose: () => {
      unsubscribeBudget()
      unsubscribeCalendar()
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
  bankService,
  calendarSyncService,
  configArchive,
  lockService,
}: MainWindowDeps): MainWindow {
  const window = new Adw.ApplicationWindow({ application })
  window.setTitle(APP_NAME)
  //window.setDefaultSize(WINDOW_WIDTH, WINDOW_HEIGHT)

  const toasts = new Adw.ToastOverlay({ vexpand: true })
  const notify: Notify = (message) => toasts.addToast(new Adw.Toast({ title: message }))
  const notifyAction: NotifyAction = (message, actionLabel, onAction) => {
    const toast = new Adw.Toast({ title: message, buttonLabel: actionLabel })
    toast.on('button-clicked', onAction)
    toasts.addToast(toast)
  }

  const budgetView = createBudgetView({
    parent: window,
    budgetStore,
    categoryStore,
    thresholdsStore,
    notify,
    notifyAction,
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

  // Calendar results are toasted: errors always, success only when the user asked for the sync.
  let manualSync = false
  let previousState = calendarSyncService.status.state
  let lastFailure = ''
  const unsubscribeCalendarToasts = calendarSyncService.onStatusChange(() => {
    const { state, message } = calendarSyncService.status
    const finished = previousState === 'syncing' && state !== 'syncing'
    previousState = state
    if (!finished) return
    const requested = manualSync
    manualSync = false
    if (state === 'online') {
      lastFailure = ''
      if (requested) notify(t().calendarToasts.synced)
    } else if (state === 'error' || (state === 'offline' && requested)) {
      const reason = message ?? describeCalendarState(state)
      if (requested || reason !== lastFailure) notify(t().calendarToasts.failed(reason))
      lastFailure = reason
    }
  })

  const header = createHeaderBar({
    calendarSyncService,
    parent: window,
    budgetStore,
    categoryStore,
    notify,
    onSyncRequested: () => { manualSync = true },
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
    bankService,
    calendarSyncService,
    configArchive,
    lockService,
  })

  const trashAction = Gio.SimpleAction.new('trash', null)
  trashAction.on('activate', () => openTrashDialog(window, { budgetStore }))
  application.addAction(trashAction)

  const lockAction = Gio.SimpleAction.new('lock', null)
  lockAction.on('activate', () => lockService.lock())
  application.addAction(lockAction)
  const renderLockAction = () => lockAction.setEnabled(lockService.enabled)
  renderLockAction()
  const unsubscribeLockSettings = lockService.onChange(renderLockAction)

  const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
  content.append(header.widget)
  content.append(pages)

  // The lock page replaces the whole window content, header included.
  const lockScreen = createLockScreen(lockService)
  const root = new Gtk.Stack({ vexpand: true })
  root.addNamed(content, 'app')
  root.addNamed(lockScreen.widget, 'lock')
  const renderLock = () => {
    if (lockService.locked) {
      // Dialogs are children of the window: close them so they do not hide the lock page.
      let dialog = window.getVisibleDialog()
      while (dialog) {
        dialog.forceClose()
        dialog = window.getVisibleDialog()
      }
      root.setVisibleChildName('lock')
      lockScreen.reset()
    } else {
      root.setVisibleChildName('app')
    }
  }
  renderLock()
  const unsubscribeLock = lockService.onLockChange(renderLock)
  window.setContent(root)

  window.on('notify::is-active', () => {
    if (window.isActive) {
      lockService.markActive()
      calendarSyncService.resume()
    } else {
      lockService.markInactive()
    }
  })

  return {
    window,
    dispose: () => {
      header.dispose()
      budgetView.dispose()
      lockScreen.dispose()
      unsubscribeHistory()
      unsubscribeCalendarToasts()
      unsubscribeLockSettings()
      unsubscribeLock()
    },
  }
}
