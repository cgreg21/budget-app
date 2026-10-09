import { normalizeCalendarConfig, type CalendarConfig } from 'budget-lib'
import { loadSecretNamespace, type SecretLoader, type SecretNamespace } from '../bank/secret.js'

/** Calendar passwords have their own keyring schema, separate from bank keys. */
export class CalendarPasswordStore {
  #secret?: Promise<SecretNamespace | null>

  constructor(private readonly loadSecret: SecretLoader = loadSecretNamespace) {}

  async load(config: CalendarConfig): Promise<string> {
    const secret = await this.namespace()
    return secret?.passwordLookupSync?.(this.schema(secret), this.attributes(config), null) ?? ''
  }

  async save(config: CalendarConfig, password: string): Promise<boolean> {
    const secret = await this.namespace()
    if (!secret?.passwordStoreSync) return false
    return secret.passwordStoreSync(
      this.schema(secret), this.attributes(config), secret.COLLECTION_DEFAULT,
      'Budget - CalDAV', password, null,
    )
  }

  private namespace(): Promise<SecretNamespace | null> {
    this.#secret ??= this.loadSecret().then((secret) => secret, () => null)
    return this.#secret
  }

  private schema(secret: SecretNamespace): unknown {
    return secret.Schema.new('org.gtk.budget-app.Calendar', secret.SchemaFlags.NONE, {
      calendar: secret.SchemaAttributeType.STRING, username: secret.SchemaAttributeType.STRING,
    })
  }

  private attributes(config: CalendarConfig): Record<string, string> {
    const normalized = normalizeCalendarConfig(config)
    return { calendar: normalized.calendarUrl, username: normalized.username }
  }
}
