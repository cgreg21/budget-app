/*
 * data/json-file-store.ts — the persistence machinery shared by every store.
 *
 * A `JsonFileStore` is an observable piece of state backed by a JSON file:
 *   - it loads the file on creation, falling back to a default when the file
 *     is missing or invalid;
 *   - `commit()` replaces the state, writes it back and notifies subscribers;
 *   - it watches the file so edits made *outside* the app (another instance,
 *     a manual edit) are picked up live. Writes performed by the store itself
 *     are recognised and never trigger a redundant reload.
 *
 * Subclasses only describe their own data: how to validate it (`parse`), what
 * to use when there is none (`createDefault`) and, optionally, how to
 * canonicalise it (`normalize`).
 */
import fs from 'node:fs'
import path from 'node:path'

export type StoreListener = () => void
export type Unsubscribe = () => void

/** Editors usually emit several filesystem events per save. */
const RELOAD_DEBOUNCE_MS = 150

function serialize(state: unknown): string {
  return JSON.stringify(state, null, 2)
}

export abstract class JsonFileStore<T> {
  readonly #filePath: string
  readonly #directory: string
  readonly #listeners = new Set<StoreListener>()
  #state: T
  #lastWritten: string
  #watcher?: fs.FSWatcher
  #reloadTimer?: NodeJS.Timeout

  protected constructor(filePath: string) {
    this.#filePath = filePath
    this.#directory = path.dirname(filePath)
    this.#state = this.normalize(this.#loadFromDisk() ?? this.createDefault())
    this.#lastWritten = serialize(this.#state)
    this.#startWatching()
  }

  /** Subscribe to every change, local or external. Returns an unsubscribe function. */
  onChange(listener: StoreListener): Unsubscribe {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** Release the file watcher and subscribers. Call this when the app closes. */
  dispose(): void {
    this.#watcher?.close()
    this.#watcher = undefined
    if (this.#reloadTimer) clearTimeout(this.#reloadTimer)
    this.#reloadTimer = undefined
    this.#listeners.clear()
  }

  /** The current state. Treat it as immutable — go through `commit` to change it. */
  protected get state(): T {
    return this.#state
  }

  /** Replace the state, persist it locally and notify subscribers. */
  protected commit(next: T): void {
    this.#state = this.normalize(next)
    this.#lastWritten = serialize(this.#state)
    fs.mkdirSync(this.#directory, { recursive: true })
    fs.writeFileSync(this.#filePath, this.#lastWritten, 'utf-8')
    this.#notify()
  }

  /** Validate JSON read from disk. Return `null` to reject the file contents. */
  protected abstract parse(raw: unknown): T | null

  /** State used on the very first run, or when the file is missing/invalid. */
  protected abstract createDefault(): T

  /** Hook to canonicalise state (sorting, deduplication, …) before it is stored. */
  protected normalize(state: T): T {
    return state
  }

  #notify(): void {
    // Copy first: a listener may unsubscribe while we iterate.
    for (const listener of [...this.#listeners]) listener()
  }

  #readRaw(): string | null {
    try {
      return fs.readFileSync(this.#filePath, 'utf-8')
    } catch {
      return null // no file yet (first run), or briefly missing mid-rewrite
    }
  }

  #parseRaw(raw: string): T | null {
    try {
      return this.parse(JSON.parse(raw))
    } catch {
      return null // invalid or partially written JSON
    }
  }

  #loadFromDisk(): T | null {
    const raw = this.#readRaw()
    return raw === null ? null : this.#parseRaw(raw)
  }

  /** Watch the containing directory and reload when *our* file changes externally. */
  #startWatching(): void {
    const fileName = path.basename(this.#filePath)
    try {
      fs.mkdirSync(this.#directory, { recursive: true })
      this.#watcher = fs.watch(this.#directory, (_eventType, changedName) => {
        if (changedName && changedName !== fileName) return
        if (this.#reloadTimer) clearTimeout(this.#reloadTimer)
        this.#reloadTimer = setTimeout(() => this.#reloadFromDisk(), RELOAD_DEBOUNCE_MS)
      })
    } catch {
      // Watching isn't available on this filesystem: external edits simply
      // won't be picked up live — everything else keeps working.
    }
  }

  #reloadFromDisk(): void {
    const raw = this.#readRaw()
    if (raw === null || raw === this.#lastWritten) return // gone, or our own write

    const parsed = this.#parseRaw(raw)
    if (parsed === null) return // malformed — ignore until the writer settles

    this.#lastWritten = raw
    this.#state = this.normalize(parsed)
    this.#notify()
  }
}
