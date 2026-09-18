/*
 * ui/dialogs/cloud-group.ts — the "Cloud" tab of the options dialog: telling
 * the application which server holds the budget.
 *
 * Four fields and a switch. The address and the user are settings and go to
 * `remote.json`; the password is not a setting and goes to the system
 * keyring, which is why the field is never filled back in — it can be
 * replaced, not read.
 *
 * Connecting is deliberately explicit: pressing "Connecter" saves, then tries
 * the server and reports what happened. Everything the server says — a wrong
 * address, refused credentials, a directory that cannot be created — comes
 * back here as a status line rather than as a silent failure, because a
 * budget that has quietly stopped syncing is worse than one that says so.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import type { RemoteStorage } from '../../data/remote/remote-storage.js'
import {
  describeStatus,
  normalizeRemoteConfig,
  type RemoteConfig,
  type RemoteState,
} from '../../domain/remote.js'
import type { AdwPreferencesGroup } from '../gtk-types.js'
import type { Notify } from '../types.js'

export interface CloudGroupOptions {
  storage: RemoteStorage
  notify: Notify
}

export interface CloudGroups {
  groups: AdwPreferencesGroup[]
  /** Releases the status subscription. */
  dispose(): void
}

const ADDRESS_HINT = 'https://cloud.exemple.org/remote.php/dav/files/alice'

export function createCloudGroups({ storage, notify }: CloudGroupOptions): CloudGroups {
  const serverGroup = new Adw.PreferencesGroup({
    title: 'Serveur WebDAV',
    description: 'Le budget est lu et écrit sur le serveur ; les fichiers locaux n’en sont '
      + 'qu’un cache. Sans réseau, le budget reste consultable mais ne peut plus être modifié. '
      + 'Compatible Nextcloud, ownCloud et tout serveur WebDAV.',
  })

  const addressRow = new Adw.EntryRow({ title: 'Adresse du serveur' })
  addressRow.setTooltipText(`Par exemple ${ADDRESS_HINT}`)
  const usernameRow = new Adw.EntryRow({ title: 'Utilisateur' })
  const passwordRow = new Adw.PasswordEntryRow({ title: 'Mot de passe' })
  const directoryRow = new Adw.EntryRow({ title: 'Dossier distant' })
  const enabledRow = new Adw.SwitchRow({
    title: 'Utiliser le serveur',
    subtitle: 'Désactivé, le budget reste sur cette machine',
  })

  serverGroup.add(addressRow)
  serverGroup.add(usernameRow)
  serverGroup.add(passwordRow)
  serverGroup.add(directoryRow)
  serverGroup.add(enabledRow)

  const statusGroup = new Adw.PreferencesGroup({ title: 'État' })
  const statusRow = new Adw.ActionRow({ title: 'Stockage local' })
  const statusIcon = new Gtk.Image({ valign: Gtk.Align.CENTER })
  statusRow.addPrefix(statusIcon)

  const syncButton = new Gtk.Button({ label: 'Synchroniser', valign: Gtk.Align.CENTER })
  statusRow.addSuffix(syncButton)
  statusGroup.add(statusRow)

  const passwordRow2 = new Adw.ActionRow({
    title: 'Mot de passe',
    subtitle: 'Conservé dans le trousseau du système, jamais dans les fichiers du budget',
  })
  passwordRow2.addPrefix(new Gtk.Image({ iconName: 'dialog-password-symbolic', valign: Gtk.Align.CENTER }))
  statusGroup.add(passwordRow2)

  /** Reads the form, canonicalised the same way the store would. */
  const configFromForm = (): RemoteConfig => normalizeRemoteConfig({
    provider: 'webdav',
    baseUrl: addressRow.text,
    username: usernameRow.text,
    remoteDir: directoryRow.text,
    enabled: enabledRow.active,
  })

  const showConfig = () => {
    const { baseUrl, username, remoteDir, enabled } = storage.config
    addressRow.text = baseUrl
    usernameRow.text = username
    directoryRow.text = remoteDir
    enabledRow.active = enabled
  }

  const showStatus = () => {
    const { state } = storage.status
    statusRow.setTitle(describeStatus(storage.status))
    statusIcon.setFromIconName(STATUS_ICONS[state])
    syncButton.setSensitive(state !== 'connecting')
    syncButton.setLabel(state === 'disabled' ? 'Connecter' : 'Synchroniser')
  }

  /** Saves the form, stores the password, then tries the server. */
  const connect = () => {
    const config = configFromForm()
    const password = passwordRow.text

    if (config.enabled && config.baseUrl === '') {
      notify('Renseignez l’adresse du serveur et l’utilisateur')
      return
    }

    void (async () => {
      if (password !== '') {
        const stored = await storage.savePassword(config, password)
        passwordRow.text = '' // never keep it on screen
        if (!stored) {
          notify('Trousseau indisponible — définissez BUDGET_APP_REMOTE_PASSWORD')
        }
      } else if (config.enabled && !(await storage.hasPassword(config))) {
        notify('Aucun mot de passe enregistré pour ce compte')
      }

      storage.saveConfig(config)
      showConfig()
      await storage.connect()
      notify(describeStatus(storage.status))
    })()
  }

  const disconnect = () => {
    const config = storage.config
    storage.disconnect()
    void storage.forgetPassword(config)
    showConfig()
    notify('Serveur déconnecté — le budget reste sur cette machine')
  }

  const applyButton = new Gtk.Button({ label: 'Connecter', cssClasses: ['suggested-action'] })
  applyButton.on('clicked', connect)
  serverGroup.setHeaderSuffix(applyButton)

  const forgetButton = new Gtk.Button({ label: 'Oublier', valign: Gtk.Align.CENTER })
  forgetButton.on('clicked', disconnect)
  statusGroup.setHeaderSuffix(forgetButton)

  syncButton.on('clicked', () => {
    void (async () => {
      await storage.connect()
      notify(describeStatus(storage.status))
    })()
  })

  showConfig()
  showStatus()
  const unsubscribe = storage.onStatusChange(showStatus)

  return { groups: [serverGroup, statusGroup], dispose: unsubscribe }
}

const STATUS_ICONS: Record<RemoteState, string> = {
  disabled: 'drive-harddisk-symbolic',
  connecting: 'content-loading-symbolic',
  online: 'network-transmit-receive-symbolic',
  offline: 'network-offline-symbolic',
  error: 'dialog-warning-symbolic',
}
