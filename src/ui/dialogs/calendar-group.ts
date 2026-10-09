/*
 * ui/dialogs/calendar-group.ts - CalDAV transaction calendar settings.
 * The password is only entered here; a saved secret is never read back.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import { isCalendarConfigComplete, type CalendarConfig } from 'budget-lib'
import type { CalendarSyncService } from '../../data/calendar/calendar-sync-service.js'
import { t } from '../../i18n/index.js'
import { describeCalendarState, formatCalendarLastSync } from '../format.js'
import type { AdwPreferencesGroup } from '../gtk-types.js'
import type { Notify } from '../types.js'

export interface CalendarGroupOptions {
  service: CalendarSyncService
  notify: Notify
}

export interface CalendarGroups {
  groups: AdwPreferencesGroup[]
  dispose(): void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createCalendarGroups({ service, notify }: CalendarGroupOptions): CalendarGroups {
  const strings = t().calendarGroup
  const config = service.config
  const settingsGroup = new Adw.PreferencesGroup({
    title: strings.settingsGroupTitle,
    description: strings.settingsGroupDescription,
  })
  const enabledRow = new Adw.SwitchRow({ title: strings.enabledLabel, active: config.enabled })
  const urlRow = new Adw.EntryRow({ title: strings.urlLabel, text: config.calendarUrl })
  const urlEntry = urlRow.getDelegate()
  if (urlEntry instanceof Gtk.Text) urlEntry.setPlaceholderText(strings.urlPlaceholder)
  urlRow.setTooltipText(strings.urlPlaceholder)
  const usernameRow = new Adw.EntryRow({ title: strings.usernameLabel, text: config.username })
  const passwordRow = new Adw.PasswordEntryRow({ title: strings.passwordLabel })
  const passwordNote = new Adw.ActionRow({ title: strings.passwordLabel, subtitle: strings.passwordSubtitle })
  const saveButton = new Gtk.Button({ label: strings.saveButton, cssClasses: ['suggested-action'] })
  settingsGroup.setHeaderSuffix(saveButton)
  settingsGroup.add(enabledRow)
  settingsGroup.add(urlRow)
  settingsGroup.add(usernameRow)
  settingsGroup.add(passwordRow)
  settingsGroup.add(passwordNote)

  const statusGroup = new Adw.PreferencesGroup({
    title: strings.statusGroupTitle,
    description: strings.statusGroupDescription,
  })
  const statusRow = new Adw.ActionRow({ title: '', subtitleLines: 0 })
  const actionsRow = new Adw.ActionRow({ title: '' })
  const testButton = new Gtk.Button({ label: strings.testButton, valign: Gtk.Align.CENTER })
  const syncButton = new Gtk.Button({
    label: strings.syncButton,
    valign: Gtk.Align.CENTER,
    cssClasses: ['suggested-action'],
  })
  actionsRow.addSuffix(testButton)
  actionsRow.addSuffix(syncButton)
  statusGroup.add(statusRow)
  statusGroup.add(actionsRow)

  const readConfig = (): CalendarConfig => ({
    ...service.config,
    enabled: enabledRow.active,
    calendarUrl: urlRow.text.trim(),
    username: usernameRow.text.trim(),
  })

  const refreshPassword = async (forConfig: CalendarConfig = readConfig()) => {
    const hasPassword = await service.hasPassword(forConfig)
    passwordNote.setSubtitle(hasPassword ? strings.passwordSavedSubtitle : strings.passwordSubtitle)
  }

  let testing = false
  const showStatus = () => {
    const status = service.status
    statusRow.setTitle(describeCalendarState(status.state))
    const details = [
      status.message ?? '',
      status.lastSync
        ? formatCalendarLastSync(status.lastSync)
        : strings.neverSynced,
    ].filter((line) => line !== '')
    statusRow.setSubtitle(details.join('\n'))
    testButton.setSensitive(!testing && status.state !== 'syncing')
    syncButton.setSensitive(service.config.enabled && status.state !== 'syncing')
  }

  const save = async () => {
    const nextConfig = readConfig()
    const password = passwordRow.text
    if ((nextConfig.enabled || password !== '') && !isCalendarConfigComplete(nextConfig)) {
      notify(strings.incompleteSettings)
      return
    }
    if (nextConfig.enabled && password === '' && !(await service.hasPassword(nextConfig))) {
      notify(strings.incompleteSettings)
      return
    }

    if (password !== '') {
      const stored = await service.savePassword(nextConfig, password)
      if (!stored) {
        notify(strings.keyringUnavailable)
        await refreshPassword(service.config)
        showStatus()
        return
      }
      passwordRow.text = ''
    }
    service.saveConfig(nextConfig)
    urlRow.text = service.config.calendarUrl
    usernameRow.text = service.config.username
    await refreshPassword(service.config)
    notify(strings.saved)
    showStatus()
  }

  saveButton.on('clicked', () => {
    void save().catch((error: unknown) => notify(strings.operationFailed(errorMessage(error))))
  })

  testButton.on('clicked', () => {
    const password = passwordRow.text
    testing = true
    showStatus()
    void service.checkConnection(readConfig(), password === '' ? undefined : password).then(
      () => notify(strings.testSucceeded),
      (error: unknown) => notify(strings.testFailed(errorMessage(error))),
    ).finally(() => { testing = false; showStatus() })
  })

  syncButton.on('clicked', () => void service.syncNow())

  void refreshPassword().catch((error: unknown) => notify(strings.operationFailed(errorMessage(error))))
  showStatus()
  const unsubscribe = service.onStatusChange(showStatus)

  return { groups: [settingsGroup, statusGroup], dispose: unsubscribe }
}
