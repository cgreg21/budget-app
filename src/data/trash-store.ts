/*
 * data/trash-store.ts — the transactions deleted but not yet gone for good,
 * persisted to `trash.json`, most recently deleted first.
 */
import { isTrashedTransactionArray, type Transaction, type TrashedTransaction } from 'budget-lib'
import { JsonFileStore } from './json-file-store.js'
import { TRASH_FILE } from './paths.js'

export class TrashStore extends JsonFileStore<TrashedTransaction[]> {
  constructor() {
    super(TRASH_FILE)
  }

  get items(): readonly TrashedTransaction[] {
    return this.state
  }

  /** Puts transactions in the trash, replacing entries that share an id. */
  add(transactions: readonly Transaction[], deletedAt = new Date().toISOString()): void {
    if (transactions.length === 0) return
    const ids = new Set(transactions.map((transaction) => transaction.id))
    this.commit([
      ...transactions.map((transaction) => ({ ...transaction, deletedAt })),
      ...this.state.filter((item) => !ids.has(item.id)),
    ])
  }

  /** Takes the entries out of the trash and returns them as plain transactions. */
  take(ids: readonly string[]): Transaction[] {
    const wanted = new Set(ids)
    const taken = this.state.filter((item) => wanted.has(item.id))
    if (taken.length === 0) return []
    this.commit(this.state.filter((item) => !wanted.has(item.id)))
    return taken.map(({ deletedAt: _deletedAt, ...transaction }) => transaction)
  }

  /** Deletes entries for good; returns how many were there. */
  remove(ids: readonly string[]): number {
    return this.take(ids).length
  }

  /** Deletes everything; returns how many entries were there. */
  empty(): number {
    const count = this.state.length
    if (count > 0) this.commit([])
    return count
  }

  /** Applies what a calendar synchronisation trashed (`added`) and restored or emptied (`removed`). */
  applyCalendar(added: readonly TrashedTransaction[], removed: readonly string[]): void {
    if (added.length === 0 && removed.length === 0) return
    const replaced = new Set([...removed, ...added.map((item) => item.id)])
    this.commit([...added.map((item) => ({ ...item })), ...this.state.filter((item) => !replaced.has(item.id))])
  }

  protected parse(raw: unknown): TrashedTransaction[] | null {
    return isTrashedTransactionArray(raw) ? raw : null
  }

  protected createDefault(): TrashedTransaction[] {
    return []
  }

  protected override normalize(state: TrashedTransaction[]): TrashedTransaction[] {
    return [...state].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
  }
}
