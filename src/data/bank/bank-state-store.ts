/*
 * data/bank/bank-state-store.ts — what the application remembers about the bank
 * connection, in `bank.json`.
 *
 * Granted access and imported transaction ids stay on this machine. The
 * private key is kept separately in the keyring (see bank-key-store.ts).
 */
import { defaultBankState, isBankState, type BankState } from 'budget-lib'
import { JsonFileStore } from '../json-file-store.js'
import { BANK_STATE_FILE } from '../paths.js'

/** Where the bank sends the user back: a one-shot listener on this machine (see redirect-listener.ts). */
export const DEFAULT_BANK_REDIRECT_URL = 'http://localhost:8765/bank'

export class BankStateStore extends JsonFileStore<BankState> {
  constructor() {
    super(BANK_STATE_FILE)
  }

  get bank(): BankState {
    return this.state
  }

  save(next: BankState): void {
    this.commit(next)
  }

  protected parse(raw: unknown): BankState | null {
    return isBankState(raw) ? raw : null
  }

  protected createDefault(): BankState {
    return defaultBankState(new Date().toISOString().slice(0, 10), DEFAULT_BANK_REDIRECT_URL)
  }
}
