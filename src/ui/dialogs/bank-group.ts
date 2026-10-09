/*
 * ui/dialogs/bank-group.ts — the "Banque" tab of the options dialog: bringing
 * the transactions of a bank account into the budget through Enable Banking.
 *
 * Three groups. The credentials (the application's identifier and its private
 * key — the key is read from a PEM file, goes to the system keyring and is
 * never shown again), the connection (which bank, where the bank sends the
 * user back, from which day to import) and the status with its actions.
 *
 * Everything the bank or the network says comes back as a notice on the
 * service; it is worded here, shown on the status row and as a toast.
 */
import fs from 'node:fs'

import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import type { Aspsp } from 'budget-lib'
import type { BankNotice, BankService } from '../../data/bank/bank-service.js'
import { t } from '../../i18n/index.js'
import { formatDate } from '../format.js'
import type { AdwPreferencesGroup, GtkWidget } from '../gtk-types.js'
import type { Notify } from '../types.js'
import { chooseFileToOpen } from './file-dialogs.js'

export interface BankGroupOptions {
  service: BankService
  parent: GtkWidget
  notify: Notify
}

export interface BankGroups {
  groups: AdwPreferencesGroup[]
  /** Releases the status subscription. */
  dispose(): void
}

/** What the user is most likely to be looking for; replaced by whatever was searched last. */
const DEFAULT_SEARCH = 'Bretagne'

export function describeBankNotice(notice: BankNotice): string {
  const strings = t().bankGroup
  switch (notice.code) {
    case 'waiting':
      return strings.waitingForBank(notice.listening)
    case 'imported':
      return strings.imported(notice.count)
    case 'refused':
      return strings.refused(notice.detail)
    case 'auth':
      return strings.authRefused(notice.detail)
    case 'failed':
      return strings.failed(notice.detail)
    case 'invalid-date':
      return strings.invalidDate
    case 'missing-credentials':
      return strings.missingCredentials
    case 'unexpected-return':
      return strings.unexpectedReturn
    case 'no-code':
      return strings.noCode
    case 'not-connected':
      return strings.notConnected
    case 'expired':
      return strings.expired
    case 'network':
      return strings.network
    case 'rate-limit':
      return strings.rateLimit
  }
}

export function createBankGroups({ service, parent, notify }: BankGroupOptions): BankGroups {
  const strings = t().bankGroup
  const { config } = service.state

  // Credentials
  const credentialsGroup = new Adw.PreferencesGroup({
    title: strings.credentialsGroupTitle,
    description: strings.credentialsGroupDescription,
  })
  const applicationIdRow = new Adw.EntryRow({
    title: strings.applicationIdLabel,
    showApplyButton: true,
    text: config.applicationId,
  })
  const keyRow = new Adw.ActionRow({ title: strings.keyLabel })
  keyRow.addPrefix(new Gtk.Image({ iconName: 'dialog-password-symbolic', valign: Gtk.Align.CENTER }))
  const chooseKeyButton = new Gtk.Button({ label: strings.chooseKeyButton, valign: Gtk.Align.CENTER })
  const forgetButton = new Gtk.Button({ label: strings.forgetButton, valign: Gtk.Align.CENTER })
  keyRow.addSuffix(chooseKeyButton)
  keyRow.addSuffix(forgetButton)
  credentialsGroup.add(applicationIdRow)
  credentialsGroup.add(keyRow)

  // Connection
  const connectionGroup = new Adw.PreferencesGroup({
    title: strings.connectionGroupTitle,
    description: strings.connectionGroupDescription,
  })
  const searchRow = new Adw.EntryRow({
    title: strings.searchLabel,
    showApplyButton: true,
    text: DEFAULT_SEARCH,
  })
  const bankRow = new Adw.ComboRow({
    title: strings.bankLabel,
    model: Gtk.StringList.new(config.bankName === '' ? [] : [config.bankName]),
  })
  const redirectRow = new Adw.EntryRow({ title: strings.redirectUrlLabel, text: config.redirectUrl })
  redirectRow.setTooltipText(strings.redirectUrlTooltip)
  const importFromRow = new Adw.EntryRow({ title: strings.importFromLabel, text: config.importFrom })
  const saveButton = new Gtk.Button({ label: strings.saveSettingsButton, valign: Gtk.Align.CENTER })
  connectionGroup.setHeaderSuffix(saveButton)
  connectionGroup.add(searchRow)
  connectionGroup.add(bankRow)
  connectionGroup.add(redirectRow)
  connectionGroup.add(importFromRow)

  // Status and actions
  const statusGroup = new Adw.PreferencesGroup({ title: strings.statusGroupTitle })
  const statusRow = new Adw.ActionRow({ title: strings.notConnected, subtitleLines: 0 })
  const statusIcon = new Gtk.Image({ valign: Gtk.Align.CENTER })
  statusRow.addPrefix(statusIcon)
  const noticeRow = new Adw.ActionRow({ title: '', subtitleLines: 0, titleLines: 0, visible: false })
  const pasteRow = new Adw.EntryRow({ title: strings.pasteLabel, showApplyButton: true })

  const connectButton = new Gtk.Button({ label: strings.connectButton, cssClasses: ['suggested-action'] })
  const importButton = new Gtk.Button({ label: strings.importNowButton })
  const disconnectButton = new Gtk.Button({ label: strings.disconnectButton })
  const actions = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, halign: Gtk.Align.END })
  actions.append(disconnectButton)
  actions.append(importButton)
  actions.append(connectButton)

  statusGroup.add(statusRow)
  statusGroup.add(noticeRow)
  statusGroup.add(pasteRow)
  statusGroup.add(actions)

  let banks: Aspsp[] = []
  let shownNotice: BankNotice | null = service.status.notice
  let keyKnown = false
  if (shownNotice !== null) {
    noticeRow.setTitle(describeBankNotice(shownNotice))
    noticeRow.setVisible(true)
  }

  const showKey = () => {
    keyRow.setSubtitle(keyKnown ? strings.keySavedSubtitle : strings.keyMissingSubtitle)
    forgetButton.setSensitive(keyKnown || service.state.config.applicationId !== '')
  }

  const refreshKey = () => {
    void service.hasKey().then((has) => {
      keyKnown = has
      showKey()
    })
  }

  const showStatus = () => {
    const { busy, notice } = service.status
    const { session, lastImportAt } = service.state
    const connected = session !== null

    statusRow.setTitle(
      connected ? strings.connectedTo(service.state.config.bankName, session.accounts.length) : strings.notConnected,
    )
    const details = [
      connected ? strings.validUntil(formatDate(session.validUntil.slice(0, 10))) : '',
      strings.lastImport(lastImportAt === '' ? strings.never : formatDate(lastImportAt.slice(0, 10))),
      strings.renewNote,
    ].filter((line) => line !== '')
    statusRow.setSubtitle(details.join('\n'))
    statusIcon.setFromIconName(connected && !service.expired ? 'emblem-ok-symbolic' : 'dialog-warning-symbolic')

    importButton.setSensitive(connected && !busy)
    disconnectButton.setSensitive(connected && !busy)
    connectButton.setSensitive(!busy)
    pasteRow.setSensitive(!busy)

    if (notice !== shownNotice) {
      shownNotice = notice
      noticeRow.setVisible(notice !== null)
      if (notice !== null) {
        const message = describeBankNotice(notice)
        noticeRow.setTitle(message)
        notify(message)
      }
    }
  }

  const rebuildBanks = (list: Aspsp[]) => {
    banks = list
    bankRow.setModel(Gtk.StringList.new(list.map((bank) => bank.name)))
    bankRow.selected = 0
  }

  /** Banks matching the search text, accents and case aside. */
  const search = async (): Promise<Aspsp[]> => {
    const wanted = fold(searchRow.text)
    const found = (await service.listBanks()).filter((bank) => fold(bank.name).includes(wanted))
    rebuildBanks(found)
    if (found.length === 0 && service.status.notice === null) notify(strings.noBank)
    return found
  }

  const saveSettings = (): boolean => {
    const saved = service.saveSettings(redirectRow.text, importFromRow.text)
    if (saved) notify(strings.settingsSaved)
    return saved
  }

  const saveApplicationId = async () => {
    await service.saveCredentials(applicationIdRow.text, '')
    refreshKey()
  }

  const loadKey = (filePath: string) => {
    void (async () => {
      const id = applicationIdRow.text.trim()
      if (id === '') {
        notify(strings.missingCredentials)
        return
      }
      let text: string
      try {
        text = fs.readFileSync(filePath, 'utf-8')
      } catch {
        notify(strings.invalidKey)
        return
      }
      if (!(await service.saveCredentials(id, text))) {
        notify(/PRIVATE KEY/.test(text) ? strings.keyringUnavailable : strings.invalidKey)
      } else {
        notify(strings.keySaved)
      }
      refreshKey()
    })()
  }

  const selectedBank = async (): Promise<Aspsp | null> => {
    const chosen = banks[bankRow.selected]
    if (chosen) return chosen
    const { bankName, bankCountry, bankConsentSeconds } = service.state.config
    if (bankName !== '') return { name: bankName, country: bankCountry, maximumConsentSeconds: bankConsentSeconds }
    return (await search())[0] ?? null
  }

  chooseKeyButton.on('clicked', () => {
    chooseFileToOpen(
      parent,
      { title: strings.keyLabel, filterName: strings.keyFilterName, patterns: ['*.pem', '*.key'] },
      loadKey,
    )
  })

  forgetButton.on('clicked', () => {
    void (async () => {
      await service.forgetCredentials()
      applicationIdRow.text = ''
      refreshKey()
      notify(strings.credentialsForgotten)
    })()
  })

  applicationIdRow.on('apply', () => void saveApplicationId())
  searchRow.on('apply', () => void search())
  saveButton.on('clicked', saveSettings)

  connectButton.on('clicked', () => {
    void (async () => {
      if (!saveSettings()) return
      await saveApplicationId()
      const bank = await selectedBank()
      if (bank !== null) await service.connect(bank)
    })()
  })

  importButton.on('clicked', () => void service.importNow())
  disconnectButton.on('clicked', () => {
    service.disconnect()
    notify(strings.disconnected)
  })

  pasteRow.on('apply', () => {
    const text = pasteRow.text
    if (text.trim() === '') return
    pasteRow.text = ''
    void service.handleRedirect(text)
  })

  refreshKey()
  showKey()
  showStatus()
  const unsubscribe = service.onStatusChange(showStatus)

  return { groups: [credentialsGroup, connectionGroup, statusGroup], dispose: unsubscribe }
}

/** Lower case without accents, so "credit" finds "Crédit". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}
