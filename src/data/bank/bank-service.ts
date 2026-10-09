/*
 * data/bank/bank-service.ts — brings the transactions of a bank account into
 * the budget through Enable Banking.
 *
 * The application id and private key are the user's own (Enable Banking
 * "linked accounts" mode). The key stays in the keyring; the connection state
 * lives in `bank.json`. The protocol is budget-lib's, shared with the mobile
 * application — this class is only the desktop's orchestration of it: where
 * the state is kept, how the bank's answer comes back, when to import again.
 *
 * It reports what happened as a `BankNotice` code rather than a sentence, so
 * the interface can word it in the user's language.
 */
import {
  bankImportStart,
  BankApiError,
  EnableBankingClient,
  isBankAutoImportDue,
  isBankDate,
  isSessionExpired,
  normalizePrivateKey,
  parseBankRedirect,
  rememberBankIds,
  toBudgetTransactions,
  type Aspsp,
  type BankHttp,
  type BankSession,
  type BankState,
  type Category,
  type JwtSigner,
  type Transaction,
} from 'budget-lib'

import { createId } from '../id.js'
import { nodeBankHttp, rsaSigner } from './node-bank.js'
import { listenForBankRedirect, type RedirectListener } from './redirect-listener.js'

/** How often a running application checks whether an automatic import is due. */
export const BANK_AUTO_IMPORT_CHECK_MS = 30 * 60 * 1000

export type BankNotice =
  | { code: 'waiting'; listening: boolean }
  | { code: 'imported'; count: number }
  | { code: 'refused' | 'auth' | 'failed'; detail: string }
  | {
      code:
        | 'invalid-date'
        | 'missing-credentials'
        | 'unexpected-return'
        | 'no-code'
        | 'not-connected'
        | 'expired'
        | 'network'
        | 'rate-limit'
    }

export interface BankStatus {
  busy: boolean
  notice: BankNotice | null
}

export type BankStatusListener = (status: BankStatus) => void

/** The part of the state store the service needs. */
export interface BankStateHolder {
  readonly bank: BankState
  save(state: BankState): void
}

export interface BankKeys {
  load(applicationId: string): Promise<string>
  save(applicationId: string, key: string): Promise<boolean>
  remove(applicationId: string): Promise<void>
}

export interface BankServiceDeps {
  state: BankStateHolder
  keys: BankKeys
  categories: () => readonly Category[]
  /** Adds the transactions to the budget; returns how many were new. */
  importTransactions: (transactions: readonly Transaction[]) => number
  /** Opens the bank's authorisation page in the user's browser. */
  openUrl: (url: string) => void
  language: () => string
  http?: BankHttp
  sign?: JwtSigner
  listen?: typeof listenForBankRedirect
  now?: () => number
  randomState?: () => string
}

export class BankService {
  readonly #deps: BankServiceDeps
  readonly #listeners = new Set<BankStatusListener>()
  #status: BankStatus = { busy: false, notice: null }
  #banks: Aspsp[] | null = null
  #listener?: RedirectListener
  #timer?: NodeJS.Timeout

  constructor(deps: BankServiceDeps) {
    this.#deps = deps
  }

  get status(): BankStatus {
    return this.#status
  }

  get state(): BankState {
    return this.#deps.state.bank
  }

  get session(): BankSession | null {
    return this.state.session
  }

  get connected(): boolean {
    return this.session !== null
  }

  get expired(): boolean {
    return isSessionExpired(this.session, this.#now())
  }

  onStatusChange(listener: BankStatusListener): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** Imports now when the last import is old, then keeps checking while the application runs. */
  start(): void {
    if (this.#timer) return
    void this.#autoImport()
    this.#timer = setInterval(() => void this.#autoImport(), BANK_AUTO_IMPORT_CHECK_MS)
    this.#timer.unref()
  }

  dispose(): void {
    if (this.#timer) clearInterval(this.#timer)
    this.#timer = undefined
    this.#listener?.close()
    this.#listener = undefined
    this.#listeners.clear()
  }

  async hasKey(): Promise<boolean> {
    return (await this.#deps.keys.load(this.state.config.applicationId)) !== ''
  }

  /**
   * Remembers the application id and, when a PEM is given, stores the key. Returns
   * false when the text holds no private key or the keyring refused it.
   */
  async saveCredentials(applicationId: string, privateKeyText: string): Promise<boolean> {
    const id = applicationId.trim()
    let stored = true
    if (privateKeyText.trim() !== '') {
      const key = normalizePrivateKey(privateKeyText)
      stored = key !== '' && (await this.#deps.keys.save(id, key))
    }
    this.#update({ config: { ...this.state.config, applicationId: id } })
    return stored
  }

  saveSettings(redirectUrl: string, importFrom: string): boolean {
    if (!isBankDate(importFrom)) {
      this.#fail({ code: 'invalid-date' })
      return false
    }
    this.#update({ config: { ...this.state.config, redirectUrl: redirectUrl.trim(), importFrom: importFrom.trim() } })
    this.#notify({ notice: null })
    return true
  }

  /** The banks of France that can be connected (cached for the session). */
  async listBanks(): Promise<Aspsp[]> {
    if (this.#banks !== null) return this.#banks
    const client = await this.#client()
    if (client === null) return []
    const list = (await this.#guard(() => client.listBanks('FR'))) ?? []
    if (list.length > 0) this.#banks = list
    return list
  }

  /** Opens the bank's authorisation page; the bank then sends the user back with a code. */
  async connect(bank: Aspsp): Promise<void> {
    const client = await this.#client()
    if (client === null) return

    const state = (this.#deps.randomState ?? (() => `${createId()}${createId()}`))()
    const { redirectUrl } = this.state.config
    const url = await this.#guard(() => client.startAuthorization(bank, redirectUrl, state, this.#deps.language()))
    if (url === undefined) return

    this.#update({
      config: {
        ...this.state.config,
        bankName: bank.name,
        bankCountry: bank.country,
        bankConsentSeconds: bank.maximumConsentSeconds,
      },
      pendingState: state,
    })

    const listening = await this.#listenForReturn(redirectUrl)
    this.#notify({ notice: { code: 'waiting', listening } })
    this.#deps.openUrl(url)
  }

  /** Finishes the connection from the URL (or bare code) the bank sent back, then imports. */
  async handleRedirect(input: string): Promise<void> {
    const { code, state, error } = parseBankRedirect(input)
    const pending = this.state.pendingState
    if (error !== '') return this.#fail({ code: 'refused', detail: error })
    if (pending === '' || (state !== '' && state !== pending)) return this.#fail({ code: 'unexpected-return' })
    if (code === '') return this.#fail({ code: 'no-code' })

    const client = await this.#client()
    if (client === null) return
    const session = await this.#guard(() => client.createSession(code))
    if (session === undefined) return

    this.#update({ session, pendingState: '' })
    await this.importNow()
  }

  /** Fetches the booked transactions since the last import and adds the new ones to the budget. */
  async importNow(silent = false): Promise<void> {
    const { session } = this.state
    if (session === null) return silent ? undefined : this.#fail({ code: 'not-connected' })
    if (this.expired) return silent ? undefined : this.#fail({ code: 'expired' })
    const client = await this.#client(silent)
    if (client === null) return

    const dateFrom = bankImportStart(this.state.config.importFrom, this.state.lastImportAt)
    const categories = this.#deps.categories()
    const imported = await this.#guard(async () => {
      const incoming: Transaction[] = []
      for (const account of session.accounts) {
        const entries = await client.transactions(account.uid, dateFrom)
        incoming.push(...toBudgetTransactions(account.uid, entries, categories))
      }
      const known = new Set(this.state.importedIds)
      const fresh = incoming.filter((transaction) => !known.has(transaction.id))
      return { fresh, added: this.#deps.importTransactions(fresh) }
    }, silent)
    if (imported === undefined) return

    this.#update({
      lastImportAt: new Date(this.#now()).toISOString(),
      importedIds: rememberBankIds(
        this.state.importedIds,
        imported.fresh.map((transaction) => transaction.id),
      ),
    })
    this.#notify({ notice: { code: 'imported', count: imported.added } })
  }

  /** Forgets the connection; the credentials and the list of imported transactions stay. */
  disconnect(): void {
    this.#listener?.close()
    this.#listener = undefined
    this.#update({ session: null, pendingState: '' })
    this.#notify({ notice: null })
  }

  async forgetCredentials(): Promise<void> {
    const { applicationId } = this.state.config
    await this.#deps.keys.remove(applicationId)
    this.disconnect()
    this.#update({ config: { ...this.state.config, applicationId: '' } })
  }

  async #autoImport(): Promise<void> {
    if (this.#status.busy || !isBankAutoImportDue(this.state, this.expired, this.#now())) return
    await this.importNow(true)
  }

  /** Starts the one-shot listener when the redirect URL is a loopback one; the user pastes the URL otherwise. */
  async #listenForReturn(redirectUrl: string): Promise<boolean> {
    this.#listener?.close()
    this.#listener = undefined
    try {
      const listen = this.#deps.listen ?? listenForBankRedirect
      this.#listener = await listen(redirectUrl, (url) => void this.handleRedirect(url))
      return true
    } catch {
      return false
    }
  }

  async #client(silent = false): Promise<EnableBankingClient | null> {
    const { applicationId } = this.state.config
    const key = applicationId === '' ? '' : await this.#deps.keys.load(applicationId)
    if (applicationId === '' || key === '') {
      if (!silent) this.#fail({ code: 'missing-credentials' })
      return null
    }
    return new EnableBankingClient(this.#deps.http ?? nodeBankHttp, this.#deps.sign ?? rsaSigner, applicationId, key)
  }

  /** Runs a call with the busy flag on; errors become a notice and the result `undefined`. */
  async #guard<T>(call: () => Promise<T>, silent = false): Promise<T | undefined> {
    this.#notify({ busy: true })
    try {
      return await call()
    } catch (error) {
      if (!silent) this.#fail(describeError(error))
      return undefined
    } finally {
      this.#notify({ busy: false })
    }
  }

  #fail(notice: BankNotice): void {
    this.#notify({ notice })
  }

  #update(patch: Partial<BankState>): void {
    this.#deps.state.save({ ...this.state, ...patch })
  }

  #notify(patch: Partial<BankStatus>): void {
    this.#status = { ...this.#status, ...patch }
    for (const listener of [...this.#listeners]) listener(this.#status)
  }

  #now(): number {
    return (this.#deps.now ?? Date.now)()
  }
}

function describeError(error: unknown): BankNotice {
  if (!(error instanceof BankApiError)) {
    return { code: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
  switch (error.kind) {
    case 'network':
      return { code: 'network' }
    case 'rate-limit':
      return { code: 'rate-limit' }
    case 'expired':
      return { code: 'expired' }
    case 'auth':
      return { code: 'auth', detail: error.message }
    default:
      return { code: 'failed', detail: error.message }
  }
}
