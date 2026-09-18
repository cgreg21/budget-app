/*
 * domain/remote.ts — what it means for the budget to live on a remote server
 * rather than on this machine.
 *
 * The application speaks to a *provider*, not to a protocol: WebDAV is the
 * one implemented today, but everything here is expressed in terms a second
 * provider could honour too — a base address, a directory, a user, and a flat
 * set of file names mirroring the local layout.
 *
 * Two rules shape the whole design and both live here:
 *   - the remote is the reference, the local files are only its cache;
 *   - without a connection the budget is read-only, so a change is never
 *     written to a cache that the server could contradict later.
 *
 * The password is deliberately absent from `RemoteConfig`: it belongs to the
 * system keyring (see data/remote/credentials.ts), never to a settings file.
 */
import { isMonthKey, type MonthKey } from './month.js'

/** The providers the storage can speak to. One for now; the seam is the point. */
export type RemoteProviderKind = 'webdav'

export const REMOTE_PROVIDER_KINDS: readonly RemoteProviderKind[] = ['webdav']

export interface RemoteConfig {
  /** Which protocol to speak. */
  provider: RemoteProviderKind
  /** Root address of the server, e.g. `https://cloud.example.org/remote.php/dav/files/alice`. */
  baseUrl: string
  username: string
  /** Directory holding the budget on that server, relative to `baseUrl`. */
  remoteDir: string
  /** Whether the budget is actually read from and written to the remote. */
  enabled: boolean
}

export const DEFAULT_REMOTE_DIR = 'budget-app'

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
  provider: 'webdav',
  baseUrl: '',
  username: '',
  remoteDir: DEFAULT_REMOTE_DIR,
  enabled: false,
}

/**
 * Where the budget stands with regard to its server.
 *
 *   disabled    no remote configured — the app keeps its files to itself
 *   connecting  reaching the server, contents not settled yet
 *   online      the cache mirrors the remote; the budget is editable
 *   offline     unreachable; the cache is readable but frozen
 *   error       reached and refused — wrong address, credentials or rights
 */
export type RemoteState = 'disabled' | 'connecting' | 'online' | 'offline' | 'error'

export interface RemoteStatus {
  state: RemoteState
  /** Why it went wrong, ready to be shown as-is. Absent unless `state` says so. */
  message?: string
  /** When the cache was last filled from the remote, ISO; absent until it is. */
  lastSyncedAt?: string
}

export const DISABLED_STATUS: RemoteStatus = { state: 'disabled' }

/** The settings files mirrored on the remote, next to the `months/` directory. */
export const REMOTE_SETTINGS_FILES: readonly string[] = [
  'categories.json',
  'thresholds.json',
  'recurrences.json',
]

/**
 * `preferences.json` is missing from that list on purpose: it records how the
 * interface was left — the charts accordion — which belongs to this screen,
 * not to the budget. Sharing it would make two machines fight over it.
 */
export const MONTHS_DIR_NAME = 'months'

const MONTH_FILE_EXTENSION = '.json'

/** Only editable while online: the cache must never hold what the server ignores. */
export function isWritable(status: RemoteStatus): boolean {
  return status.state === 'disabled' || status.state === 'online'
}

/** True once the remote is meant to be used, whether or not it answers. */
export function isRemoteActive(config: RemoteConfig): boolean {
  return config.enabled && isRemoteConfigComplete(config)
}

/** A configuration holding everything needed to attempt a connection. */
export function isRemoteConfigComplete(config: RemoteConfig): boolean {
  return normalizeBaseUrl(config.baseUrl) !== '' && config.username.trim() !== ''
}

export function isRemoteProviderKind(value: unknown): value is RemoteProviderKind {
  return REMOTE_PROVIDER_KINDS.includes(value as RemoteProviderKind)
}

export function isRemoteConfig(value: unknown): value is RemoteConfig {
  if (typeof value !== 'object' || value === null) return false

  const { provider, baseUrl, username, remoteDir, enabled } = value as Partial<RemoteConfig>
  return (
    isRemoteProviderKind(provider) &&
    typeof baseUrl === 'string' &&
    typeof username === 'string' &&
    typeof remoteDir === 'string' &&
    typeof enabled === 'boolean'
  )
}

/**
 * Canonicalises what the user typed: addresses lose their trailing slash,
 * directories their surrounding ones, and a blank directory falls back to the
 * default so the budget never lands in the account's root.
 */
export function normalizeRemoteConfig(config: RemoteConfig): RemoteConfig {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const remoteDir = normalizeRemoteDir(config.remoteDir)

  return {
    provider: config.provider,
    baseUrl,
    username: config.username.trim(),
    remoteDir,
    // A configuration that cannot be connected to is not left switched on:
    // the app would keep reporting an error it can do nothing about.
    enabled: config.enabled && baseUrl !== '' && config.username.trim() !== '',
  }
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

/** A directory path with no leading, trailing or doubled separator. */
export function normalizeRemoteDir(remoteDir: string): string {
  const cleaned = remoteDir
    .trim()
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/')

  return cleaned === '' ? DEFAULT_REMOTE_DIR : cleaned
}

/** The remote path of a settings file, relative to `baseUrl`. */
export function remotePathOf(config: RemoteConfig, fileName: string): string {
  return `${normalizeRemoteDir(config.remoteDir)}/${fileName}`
}

/** The remote directory holding the month files, relative to `baseUrl`. */
export function remoteMonthsDir(config: RemoteConfig): string {
  return remotePathOf(config, MONTHS_DIR_NAME)
}

export function remoteMonthPath(config: RemoteConfig, month: MonthKey): string {
  return `${remoteMonthsDir(config)}/${month}${MONTH_FILE_EXTENSION}`
}

/** The month a remote file name holds, or `null` when it is not one of ours. */
export function monthFromRemoteName(fileName: string): MonthKey | null {
  if (!fileName.endsWith(MONTH_FILE_EXTENSION)) return null
  const month = fileName.slice(0, -MONTH_FILE_EXTENSION.length)
  return isMonthKey(month) ? month : null
}

/** Joins a base address and a relative path into the URL a provider requests. */
export function remoteUrl(baseUrl: string, remotePath: string): string {
  const base = normalizeBaseUrl(baseUrl)
  const encoded = remotePath
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return encoded === '' ? base : `${base}/${encoded}`
}

/** A one-line account of where the budget stands, shown in the options dialog. */
export function describeStatus(status: RemoteStatus): string {
  switch (status.state) {
    case 'disabled':
      return 'Stockage local — aucun serveur configuré'
    case 'connecting':
      return 'Connexion au serveur…'
    case 'online':
      return status.lastSyncedAt
        ? `Connecté — dernière synchronisation à ${formatTime(status.lastSyncedAt)}`
        : 'Connecté'
    case 'offline':
      return 'Hors ligne — budget en lecture seule'
    case 'error':
      return status.message ?? 'Erreur de connexion'
  }
}

function formatTime(isoDate: string): string {
  const date = new Date(isoDate)
  return Number.isNaN(date.getTime())
    ? isoDate
    : new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date)
}
