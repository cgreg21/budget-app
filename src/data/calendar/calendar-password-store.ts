import { normalizeCalendarConfig, type CalendarConfig } from 'budget-lib'
import { loadSecretNamespace, type SecretLoader } from '../bank/secret.js'
import { defaultBackends, SecureStore, type SecureStoreBackendName } from '../secure-store.js'

const CALENDAR_SCHEMA = 'org.gtk.budget-app.Calendar'

/** Calendar passwords have their own schema, separate from bank keys, in whichever secure store the machine offers. */
export class CalendarPasswordStore {
  private readonly store: SecureStore

  constructor(loadSecret: SecretLoader = loadSecretNamespace, store?: SecureStore) {
    this.store = store ?? new SecureStore(defaultBackends(loadSecret))
  }

  /** How passwords are kept on this machine, or `null` when they cannot be. */
  backendName(): Promise<SecureStoreBackendName | null> {
    return this.store.backendName()
  }

  load(config: CalendarConfig): Promise<string> {
    return this.store.load(this.account(config))
  }

  save(config: CalendarConfig, password: string): Promise<boolean> {
    return this.store.save(this.account(config), password)
  }

  private account(config: CalendarConfig) {
    const normalized = normalizeCalendarConfig(config)
    return {
      schema: CALENDAR_SCHEMA, label: 'Budget - CalDAV',
      attributes: { calendar: normalized.calendarUrl, username: normalized.username },
    }
  }
}
