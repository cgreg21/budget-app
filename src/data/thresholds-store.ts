/*
 * data/thresholds-store.ts — the balance thresholds, persisted to
 * `thresholds.json`.
 *
 * Values that break the x < y < z rule are rejected, whether they come from
 * the options dialog or from a hand-edited file — in the latter case the
 * defaults are used instead.
 */
import {
  DEFAULT_BALANCE_THRESHOLDS,
  isBalanceThresholds,
  type BalanceThresholds,
} from '../domain/balance.js'
import { JsonFileStore } from './json-file-store.js'
import { THRESHOLDS_FILE } from './paths.js'

export class ThresholdsStore extends JsonFileStore<BalanceThresholds> {
  constructor() {
    super(THRESHOLDS_FILE)
  }

  get thresholds(): BalanceThresholds {
    return this.state
  }

  /** Persists the thresholds. Returns false when they are out of order. */
  save(next: BalanceThresholds): boolean {
    if (!isBalanceThresholds(next)) return false
    this.commit(next)
    return true
  }

  protected parse(raw: unknown): BalanceThresholds | null {
    // Keep only the three known fields, so extra keys never reach the UI.
    return isBalanceThresholds(raw) ? { low: raw.low, medium: raw.medium, high: raw.high } : null
  }

  protected createDefault(): BalanceThresholds {
    return DEFAULT_BALANCE_THRESHOLDS
  }
}
