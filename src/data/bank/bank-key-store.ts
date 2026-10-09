/*
 * data/bank/bank-key-store.ts — where the Enable Banking private key is kept.
 *
 * The private key signs every request made in the user's name, so it goes to the system
 * keyring, never to `bank.json`. When libsecret is unavailable — Windows,
 * minimal containers — it is read from the environment instead.
 */
import { loadSecretNamespace, type SecretLoader, type SecretNamespace } from './secret.js'

const SCHEMA_NAME = 'org.gtk.budget-app.Bank'
const KEYRING_LABEL = 'Budget — clé Enable Banking'

export const BANK_KEY_ENV_VAR = 'BUDGET_APP_BANK_PRIVATE_KEY'

export interface BankKeyStoreOptions {
  loadSecret?: SecretLoader
  env?: NodeJS.ProcessEnv
}

export class BankKeyStore {
  readonly #loadSecret: SecretLoader
  readonly #env: NodeJS.ProcessEnv
  #secret?: Promise<SecretNamespace | null>

  constructor({ loadSecret = loadSecretNamespace, env = process.env }: BankKeyStoreOptions = {}) {
    this.#loadSecret = loadSecret
    this.#env = env
  }

  /** The PEM for this application id, or '' when none is known. */
  async load(applicationId: string): Promise<string> {
    const secret = await this.#namespace()
    if (secret?.passwordLookupSync) {
      try {
        const key = secret.passwordLookupSync(this.#schema(secret), attributesOf(applicationId), null)
        if (key) return key
      } catch {
        // Keyring locked or unavailable — the environment may still know.
      }
    }
    return this.#env[BANK_KEY_ENV_VAR] ?? ''
  }

  /** `false` when the keyring refused it: the caller must say so rather than pretend. */
  async save(applicationId: string, key: string): Promise<boolean> {
    const secret = await this.#namespace()
    if (!secret?.passwordStoreSync) return false

    try {
      return secret.passwordStoreSync(
        this.#schema(secret),
        attributesOf(applicationId),
        secret.COLLECTION_DEFAULT,
        KEYRING_LABEL,
        key,
        null,
      )
    } catch {
      return false
    }
  }

  async remove(applicationId: string): Promise<void> {
    const secret = await this.#namespace()
    if (!secret?.passwordClearSync) return

    try {
      secret.passwordClearSync(this.#schema(secret), attributesOf(applicationId), null)
    } catch {
      // Nothing to forget, or nowhere to forget it from.
    }
  }

  async has(applicationId: string): Promise<boolean> {
    return (await this.load(applicationId)) !== ''
  }

  #namespace(): Promise<SecretNamespace | null> {
    this.#secret ??= this.#loadSecret().then(
      (namespace) => namespace,
      () => null,
    )
    return this.#secret
  }

  #schema(secret: SecretNamespace): unknown {
    return secret.Schema.new(SCHEMA_NAME, secret.SchemaFlags.NONE, {
      application: secret.SchemaAttributeType.STRING,
    })
  }
}

function attributesOf(applicationId: string): Record<string, string> {
  return { application: applicationId.trim() }
}
