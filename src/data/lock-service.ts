/*
 * data/lock-service.ts — the optional PIN that gates the window.
 *
 * Only a salted PBKDF2-SHA256 hash of the PIN is stored, in `lock.json`, with
 * the throttle state that slows down guessing. It is a gate on the screen: the
 * budget files stay unencrypted on disk.
 */
import crypto from 'node:crypto'
import { promisify } from 'node:util'

import { JsonFileStore, type StoreListener, type Unsubscribe } from './json-file-store.js'
import { LOCK_FILE } from './paths.js'

const pbkdf2 = promisify(crypto.pbkdf2)

export const MIN_PIN_LENGTH = 4
export const MAX_PIN_LENGTH = 8
export const PBKDF2_ITERATIONS = 150_000
/** The app locks again once it stayed inactive this long. */
export const AUTO_LOCK_MS = 30_000
export const FREE_ATTEMPTS = 5
export const BACKOFF_MS = 30_000

const KEY_LENGTH = 32
const SALT_LENGTH = 16
const MAX_BACKOFF_DOUBLINGS = 6

interface LockRecord {
  salt: string
  hash: string
  iterations: number
}

interface LockState {
  record: LockRecord | null
  failures: number
  /** Time until which a new attempt is refused (epoch ms). */
  until: number
}

const UNLOCKED: LockState = { record: null, failures: 0, until: 0 }

function isLockState(raw: unknown): raw is LockState {
  if (typeof raw !== 'object' || raw === null) return false
  const { record, failures, until } = raw as Partial<LockState>
  if (typeof failures !== 'number' || typeof until !== 'number') return false
  if (record === null) return true
  return typeof record === 'object'
    && typeof record.salt === 'string'
    && typeof record.hash === 'string'
    && typeof record.iterations === 'number'
    && Number.isInteger(record.iterations)
    && record.iterations > 0
}

export class LockService extends JsonFileStore<LockState> {
  readonly #now: () => number
  readonly #lockListeners = new Set<StoreListener>()
  #locked: boolean
  #inactiveSince: number | null = null

  constructor(now: () => number = Date.now) {
    super(LOCK_FILE)
    this.#now = now
    this.#locked = this.state.record !== null
  }

  static isValidPin(pin: string): boolean {
    return new RegExp(`^\\d{${MIN_PIN_LENGTH},${MAX_PIN_LENGTH}}$`).test(pin)
  }

  get enabled(): boolean {
    return this.state.record !== null
  }

  get locked(): boolean {
    return this.#locked
  }

  /** Time until which a new attempt is refused (epoch ms), or 0. */
  get blockedUntil(): number {
    return this.state.until > this.#now() ? this.state.until : 0
  }

  /** Subscribe to lock / unlock transitions. */
  onLockChange(listener: StoreListener): Unsubscribe {
    this.#lockListeners.add(listener)
    return () => { this.#lockListeners.delete(listener) }
  }

  lock(): void {
    if (this.enabled) this.#setLocked(true)
  }

  /** Stores a new PIN (replacing any previous one) and resets the throttle. */
  async setPin(pin: string): Promise<void> {
    if (!LockService.isValidPin(pin)) throw new Error('Invalid PIN.')
    const salt = crypto.randomBytes(SALT_LENGTH)
    const hash = await this.#derive(pin, salt, PBKDF2_ITERATIONS)
    this.commit({
      record: { salt: salt.toString('base64'), hash: hash.toString('base64'), iterations: PBKDF2_ITERATIONS },
      failures: 0,
      until: 0,
    })
  }

  /** Checks a PIN and unlocks the app when it is right; wrong attempts are slowed down after a few. */
  async unlock(pin: string): Promise<boolean> {
    if (!this.enabled) return true
    if (this.blockedUntil > 0) return false
    if (!(await this.verify(pin))) {
      this.#registerFailure()
      return false
    }
    if (this.state.failures !== 0 || this.state.until !== 0) this.commit({ ...this.state, failures: 0, until: 0 })
    this.#setLocked(false)
    return true
  }

  /** Whether the PIN is right, without unlocking (used before changing the settings). */
  async verify(pin: string): Promise<boolean> {
    const record = this.state.record
    if (record === null) return false
    const expected = Buffer.from(record.hash, 'base64')
    const actual = await this.#derive(pin, Buffer.from(record.salt, 'base64'), record.iterations)
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  }

  /** Removes the PIN; the app is never locked again until a new one is set. */
  disable(): void {
    this.commit(UNLOCKED)
    this.#setLocked(false)
  }

  /** The window lost focus or went away. */
  markInactive(): void {
    this.#inactiveSince ??= this.#now()
  }

  /** The window is back: locks it if it stayed inactive long enough. */
  markActive(): void {
    const since = this.#inactiveSince
    this.#inactiveSince = null
    if (since !== null && this.#now() - since >= AUTO_LOCK_MS) this.lock()
  }

  override dispose(): void {
    this.#lockListeners.clear()
    super.dispose()
  }

  protected parse(raw: unknown): LockState | null {
    return isLockState(raw) ? raw : null
  }

  protected createDefault(): LockState {
    return UNLOCKED
  }

  async #derive(pin: string, salt: Buffer, iterations: number): Promise<Buffer> {
    return pbkdf2(pin, salt, iterations, KEY_LENGTH, 'sha256')
  }

  #registerFailure(): void {
    const failures = this.state.failures + 1
    const until = failures >= FREE_ATTEMPTS
      ? this.#now() + BACKOFF_MS * 2 ** Math.min(failures - FREE_ATTEMPTS, MAX_BACKOFF_DOUBLINGS)
      : 0
    this.commit({ ...this.state, failures, until })
  }

  #setLocked(locked: boolean): void {
    if (this.#locked === locked) return
    this.#locked = locked
    for (const listener of [...this.#lockListeners]) listener()
  }
}
