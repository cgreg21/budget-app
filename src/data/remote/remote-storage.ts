/*
 * data/remote/remote-storage.ts — the engine that keeps the local files and
 * the server in agreement.
 *
 * The rule it enforces is short: **the server is the budget, the local files
 * are its cache**. So the engine only ever moves data in two situations —
 * it fills the cache from the server when it connects, and it mirrors a write
 * upwards as soon as a store makes one. There is no third case, because there
 * is no offline editing: the moment the server stops answering, the budget
 * goes read-only (`assertWritable` throws) and the cache can no longer drift
 * away from what the server believes.
 *
 * That single decision removes the hardest part of any sync tool. No queue of
 * pending edits, no conflict resolution, no last-write-wins guesswork: the
 * cache is either a faithful copy of the server or it is frozen.
 *
 * The one exception is the very first connection to an empty directory, which
 * is read as "this account has no budget yet" and uploads the local one. Any
 * other remote state wins over the cache, including the absence of a month.
 */
import fs from 'node:fs'
import path from 'node:path'

import {
  DISABLED_STATUS,
  isRemoteActive,
  isWritable,
  monthFromRemoteName,
  remoteMonthPath,
  remoteMonthsDir,
  remotePathOf,
  REMOTE_SETTINGS_FILES,
  MONTHS_DIR_NAME,
  type RemoteConfig,
  type RemoteStatus,
} from '../../domain/remote.js'
import type { StoreListener, Unsubscribe } from '../json-file-store.js'
import { DATA_DIR, MONTHS_DIR, monthFilePath, monthFromFileName } from '../paths.js'
import { CredentialStore } from './credentials.js'
import { RemoteReadOnlyError, type RemoteGateway } from './gateway.js'
import { RemoteRequestError, type RemoteProvider } from './provider.js'
import type { RemoteConfigStore } from './remote-config-store.js'
import { WebDavProvider } from './webdav-provider.js'

/** How long to wait before trying a server that did not answer. */
const RETRY_DELAY_MS = 60_000

export type ProviderFactory = (config: RemoteConfig, password: string) => RemoteProvider

const createDefaultProvider: ProviderFactory = (config, password) =>
  new WebDavProvider({ baseUrl: config.baseUrl, username: config.username, password })

export interface RemoteStorageOptions {
  configStore: RemoteConfigStore
  credentials?: CredentialStore
  /** Injectable so tests — and a second provider — can bypass WebDAV. */
  createProvider?: ProviderFactory
  /** Called once the cache has been refilled, so the budget can be re-read. */
  onSynced?: () => void
  /** 0 disables the automatic retry; tests rely on that. */
  retryDelayMs?: number
}

export class RemoteStorage implements RemoteGateway {
  readonly #configStore: RemoteConfigStore
  readonly #credentials: CredentialStore
  readonly #createProvider: ProviderFactory
  readonly #onSynced?: () => void
  readonly #retryDelayMs: number
  readonly #listeners = new Set<StoreListener>()

  #status: RemoteStatus = DISABLED_STATUS
  #provider: RemoteProvider | null = null
  /** Serialises uploads: two writes to one file must not race each other. */
  #queue: Promise<void> = Promise.resolve()
  #retryTimer?: NodeJS.Timeout
  #disposed = false

  constructor({
    configStore,
    credentials = new CredentialStore(),
    createProvider = createDefaultProvider,
    onSynced,
    retryDelayMs = RETRY_DELAY_MS,
  }: RemoteStorageOptions) {
    this.#configStore = configStore
    this.#credentials = credentials
    this.#createProvider = createProvider
    this.#onSynced = onSynced
    this.#retryDelayMs = retryDelayMs
  }

  get status(): RemoteStatus {
    return this.#status
  }

  get config(): RemoteConfig {
    return this.#configStore.config
  }

  /** Records a new server without connecting to it yet. */
  saveConfig(config: RemoteConfig): void {
    this.#configStore.save(config)
  }

  onStatusChange(listener: StoreListener): Unsubscribe {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /**
   * Connects and refills the cache. Safe to call again at any time — that is
   * exactly what the "synchronise now" button and the retry timer do.
   *
   * Never rejects: a failure is a status, not an exception. The caller is the
   * startup path, and a cloud that is down must not stop the app from opening
   * on the budget it already has.
   */
  async connect(): Promise<void> {
    this.#clearRetry()
    const config = this.config

    if (!isRemoteActive(config)) {
      this.#provider = null
      this.#setStatus(DISABLED_STATUS)
      return
    }

    this.#setStatus({ state: 'connecting', lastSyncedAt: this.#status.lastSyncedAt })

    try {
      const { password } = await this.#credentials.load(config)
      if (password === '') {
        this.#fail(new RemoteRequestError('Aucun mot de passe enregistré pour ce compte', 401))
        return
      }

      const provider = this.#createProvider(config, password)
      await provider.probe()
      await this.#pull(provider, config)

      if (this.#disposed) return
      this.#provider = provider
      this.#setStatus({ state: 'online', lastSyncedAt: new Date().toISOString() })
      this.#onSynced?.()
    } catch (error) {
      this.#provider = null
      this.#fail(error)
    }
  }

  /** Stops using the server without forgetting how to reach it. */
  disconnect(): void {
    this.#clearRetry()
    this.#provider = null
    this.#configStore.disable()
    this.#setStatus(DISABLED_STATUS)
  }

  /**
   * Hands the password to the keyring. `false` means it could not be stored —
   * worth telling the user, since the connection will then only work for as
   * long as the environment provides it.
   */
  savePassword(config: RemoteConfig, password: string): Promise<boolean> {
    return this.#credentials.save(config, password)
  }

  /** Whether a password is available for this account, without revealing it. */
  hasPassword(config: RemoteConfig): Promise<boolean> {
    return this.#credentials.has(config)
  }

  forgetPassword(config: RemoteConfig): Promise<void> {
    return this.#credentials.remove(config)
  }

  assertWritable(): void {
    if (isWritable(this.#status)) return
    throw new RemoteReadOnlyError(
      this.#status.state === 'error'
        ? `Serveur inaccessible — budget en lecture seule (${this.#status.message ?? 'erreur'})`
        : 'Hors ligne — le budget est en lecture seule',
    )
  }

  pushFile(localPath: string): void {
    const remotePath = this.#remotePathOf(localPath)
    if (remotePath === null) return

    // Read now, not when the upload runs: the file may change again meanwhile,
    // and each write is meant to reach the server as it was committed.
    let contents: string
    try {
      contents = fs.readFileSync(localPath, 'utf-8')
    } catch {
      return // vanished between the write and here; the next change will carry it
    }

    this.#enqueue((provider) => provider.write(remotePath, contents))
  }

  removeFile(localPath: string): void {
    const remotePath = this.#remotePathOf(localPath)
    if (remotePath === null) return
    this.#enqueue((provider) => provider.remove(remotePath))
  }

  /** Resolves once every queued transfer has been attempted. */
  flush(): Promise<void> {
    return this.#queue
  }

  dispose(): void {
    this.#disposed = true
    this.#clearRetry()
    this.#provider = null
    this.#listeners.clear()
  }

  /** Runs a transfer against the live provider, turning any failure into a status. */
  #enqueue(task: (provider: RemoteProvider) => Promise<void>): void {
    this.#queue = this.#queue.then(async () => {
      const provider = this.#provider
      if (provider === null || this.#disposed) return
      try {
        await task(provider)
      } catch (error) {
        this.#fail(error)
      }
    })
  }

  /**
   * Fills the cache from the server.
   *
   * Settings the server does not have are pushed up rather than deleted
   * locally: a category list added on this machine is data, not drift. Months
   * are the opposite — the server's list is authoritative, so a month missing
   * there is a month that was deleted, and the cache must follow.
   */
  async #pull(provider: RemoteProvider, config: RemoteConfig): Promise<void> {
    await provider.ensureDirectory(remoteMonthsDir(config))

    const settings = new Map<string, string | null>()
    for (const fileName of REMOTE_SETTINGS_FILES) {
      settings.set(fileName, await provider.read(remotePathOf(config, fileName)))
    }

    const entries = await provider.list(remoteMonthsDir(config))
    const remoteMonths = entries
      .filter((entry) => !entry.isDirectory)
      .map((entry) => monthFromRemoteName(entry.name))
      .filter((month): month is string => month !== null)

    const remoteIsEmpty = remoteMonths.length === 0 && [...settings.values()].every((value) => value === null)
    if (remoteIsEmpty) {
      await this.#seed(provider, config)
      return
    }

    for (const [fileName, contents] of settings) {
      const localPath = path.join(DATA_DIR, fileName)
      if (contents === null) await this.#uploadIfPresent(provider, remotePathOf(config, fileName), localPath)
      else writeLocalFile(localPath, contents)
    }

    for (const month of remoteMonths) {
      const contents = await provider.read(remoteMonthPath(config, month))
      if (contents !== null) writeLocalFile(monthFilePath(month), contents)
    }

    const known = new Set(remoteMonths)
    for (const month of localMonths()) {
      if (!known.has(month)) fs.rmSync(monthFilePath(month), { force: true })
    }
  }

  /** First connection to an empty directory: the local budget becomes the remote one. */
  async #seed(provider: RemoteProvider, config: RemoteConfig): Promise<void> {
    for (const fileName of REMOTE_SETTINGS_FILES) {
      await this.#uploadIfPresent(provider, remotePathOf(config, fileName), path.join(DATA_DIR, fileName))
    }
    for (const month of localMonths()) {
      await this.#uploadIfPresent(provider, remoteMonthPath(config, month), monthFilePath(month))
    }
  }

  async #uploadIfPresent(provider: RemoteProvider, remotePath: string, localPath: string): Promise<void> {
    const contents = readLocalFile(localPath)
    if (contents !== null) await provider.write(remotePath, contents)
  }

  /** The remote path mirroring a local file, or `null` when it is not synced. */
  #remotePathOf(localPath: string): string | null {
    const config = this.config
    const relative = path.relative(DATA_DIR, localPath)
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null

    const segments = relative.split(path.sep)
    if (segments.length === 1 && REMOTE_SETTINGS_FILES.includes(segments[0] ?? '')) {
      return remotePathOf(config, segments[0] as string)
    }
    if (segments.length === 2 && segments[0] === MONTHS_DIR_NAME) {
      const month = monthFromRemoteName(segments[1] as string)
      return month === null ? null : remoteMonthPath(config, month)
    }
    return null
  }

  /**
   * A refusal is final, an unanswered request is not: wrong credentials will
   * still be wrong in a minute, so only the second case is retried.
   */
  #fail(error: unknown): void {
    if (this.#disposed) return

    if (error instanceof RemoteRequestError) {
      this.#setStatus({ state: 'error', message: error.message, lastSyncedAt: this.#status.lastSyncedAt })
      return
    }

    this.#setStatus({ state: 'offline', lastSyncedAt: this.#status.lastSyncedAt })
    this.#scheduleRetry()
  }

  #scheduleRetry(): void {
    if (this.#retryDelayMs <= 0 || this.#retryTimer) return
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = undefined
      void this.connect()
    }, this.#retryDelayMs)
    // The GTK loop keeps the process alive; this timer must not.
    this.#retryTimer.unref?.()
  }

  #clearRetry(): void {
    if (this.#retryTimer) clearTimeout(this.#retryTimer)
    this.#retryTimer = undefined
  }

  #setStatus(status: RemoteStatus): void {
    this.#status = status
    for (const listener of [...this.#listeners]) listener()
  }
}

/** Months the cache holds, read straight from disk to keep this module standalone. */
function localMonths(): string[] {
  try {
    return fs
      .readdirSync(MONTHS_DIR)
      .map(monthFromFileName)
      .filter((month): month is string => month !== null)
  } catch {
    return [] // no history yet
  }
}

function readLocalFile(localPath: string): string | null {
  try {
    return fs.readFileSync(localPath, 'utf-8')
  } catch {
    return null
  }
}

/** Identical contents are not rewritten: the stores watch these files. */
function writeLocalFile(localPath: string, contents: string): void {
  if (readLocalFile(localPath) === contents) return
  fs.mkdirSync(path.dirname(localPath), { recursive: true })
  fs.writeFileSync(localPath, contents, 'utf-8')
}
