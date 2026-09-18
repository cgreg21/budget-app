/*
 * data/recurrence-store.ts — the recurrence templates, persisted to
 * `recurrences.json`.
 *
 * Only the templates live here; the occurrences they produce are ordinary
 * transactions stored in their own month file (see BudgetStore).
 */
import {
  isRecurrenceList,
  recurrencesFor,
  sortRecurrences,
  type Recurrence,
  type RecurrenceInput,
} from '../domain/recurrence.js'
import type { MonthKey } from '../domain/month.js'
import { createId } from './id.js'
import { JsonFileStore } from './json-file-store.js'
import { RECURRENCES_FILE } from './paths.js'

export class RecurrenceStore extends JsonFileStore<Recurrence[]> {
  constructor() {
    super(RECURRENCES_FILE)
  }

  get recurrences(): readonly Recurrence[] {
    return this.state
  }

  /** The recurrences due in a month, in list order. */
  recurrencesFor(month: MonthKey): Recurrence[] {
    return recurrencesFor(this.state, month)
  }

  find(id: string | undefined): Recurrence | undefined {
    return id === undefined ? undefined : this.state.find((recurrence) => recurrence.id === id)
  }

  add(input: RecurrenceInput): void {
    this.insert({ id: createId(), ...input })
  }

  /**
   * Adds a recurrence whose id is already known — the caller needs it to stamp
   * the transaction the series starts from before subscribers react.
   */
  insert(recurrence: Recurrence): void {
    this.commit([...this.state, recurrence])
  }

  /** Replace a recurrence's fields, keeping its id. No-op if the id is unknown. */
  update(id: string, input: RecurrenceInput): void {
    if (!this.state.some((recurrence) => recurrence.id === id)) return
    this.commit(this.state.map((recurrence) => (recurrence.id === id ? { id, ...input } : recurrence)))
  }

  /** Forgets the template; occurrences already written to a month file stay. */
  remove(id: string): void {
    this.commit(this.state.filter((recurrence) => recurrence.id !== id))
  }

  /** Swaps the whole list, e.g. when a backup is restored. */
  replaceAll(recurrences: readonly Recurrence[]): void {
    this.commit(recurrences.map((recurrence) => ({ ...recurrence })))
  }

  protected parse(raw: unknown): Recurrence[] | null {
    return isRecurrenceList(raw) ? raw : null
  }

  protected createDefault(): Recurrence[] {
    return []
  }

  protected override normalize(state: Recurrence[]): Recurrence[] {
    return sortRecurrences(state)
  }
}
