/*
 * data/remote/credentials.ts — where the server password is kept.
 *
 * Not in `remote.json`, and not in the source: a budget's cloud password is
 * the one piece of this application that must survive a `cat` of the data
 * directory. It goes to the system keyring through libsecret, which is what
 * every other desktop application on the session already uses.
 *
 * `gi:Secret-1` is loaded dynamically and every call is guarded, because the
 * typelib is genuinely optional: it is absent on Windows, on minimal
 * containers, and on sessions with no keyring daemon. When it cannot be had,
 * the password is read from the environment instead — enough for a headless
 * or scripted run, and still nothing written to disk by us.
 *
 * Nothing here ever logs, serialises or returns the password except to the
 * caller that asked for it.
 */
import { normalizeBaseUrl, type RemoteConfig } from '../../domain/remote.js'

/** Identifies our entries among everything else in the keyring. */
const SCHEMA_NAME = 'org.gtk.budget-app.Remote'
const KEYRING_LABEL = 'Budget — stockage distant'

/** Checked in order; the first one set wins. */
export const PASSWORD_ENV_VARS = ['BUDGET_APP_REMOTE_PASSWORD', 'BUDGET_APP_WEBDAV_PASSWORD'] as const

/** Which of the two places answered, so the interface can say so. */
export type CredentialBackend = 'keyring' | 'environment' | 'none'

export interface StoredPassword {
  password: string
  backend: CredentialBackend
}

/* The slice of libsecret we use, described loosely: node-gtk hands back a
 * namespace object, and we only ever touch these four members. */
interface SecretNamespace {
  Schema: { new: (name: string, flags: number, attributes: Record<string, number>) => unknown }
  SchemaFlags: { NONE: number }
  SchemaAttributeType: { STRING: number }
  COLLECTION_DEFAULT: string
  passwordLookupSync?: (schema: unknown, attributes: Record<string, string>, cancellable: null) => string | null
  passwordStoreSync?: (
    schema: unknown,
    attributes: Record<string, string>,
    collection: string,
    label: string,
    password: string,
    cancellable: null,
  ) => boolean
  passwordClearSync?: (schema: unknown, attributes: Record<string, string>, cancellable: null) => boolean
}

export type SecretLoader = () => Promise<SecretNamespace>

const loadSecretNamespace: SecretLoader = async () => {
  // The `gi:*` ambient module is typed loosely; the shape we rely on is above.
  const module = (await import('gi:Secret-1')) as unknown as { default: SecretNamespace }
  return module.default
}

export interface CredentialStoreOptions {
  /** Injectable for tests, and to pretend the typelib is missing. */
  loadSecret?: SecretLoader
  /** Injectable for tests; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv
}

/**
 * Reads and writes the password for one server account.
 *
 * Failures are never thrown at the caller of `load`: a locked or absent
 * keyring means "no password", which the connection will report as refused
 * credentials — a far more useful message than a GI stack trace.
 */
export class CredentialStore {
  readonly #loadSecret: SecretLoader
  readonly #env: NodeJS.ProcessEnv
  /** Resolved once: a missing typelib stays missing for the whole session. */
  #secret?: Promise<SecretNamespace | null>

  constructor({ loadSecret = loadSecretNamespace, env = process.env }: CredentialStoreOptions = {}) {
    this.#loadSecret = loadSecret
    this.#env = env
  }

  async load(config: RemoteConfig): Promise<StoredPassword> {
    const secret = await this.#namespace()
    if (secret?.passwordLookupSync) {
      try {
        const password = secret.passwordLookupSync(this.#schema(secret), attributesOf(config), null)
        if (password) return { password, backend: 'keyring' }
      } catch {
        // Keyring locked, refused or unavailable — the environment may still know.
      }
    }

    const fromEnv = this.#fromEnvironment()
    return fromEnv === null ? { password: '', backend: 'none' } : { password: fromEnv, backend: 'environment' }
  }

  /**
   * Stores the password, reporting where it landed. `false` means the keyring
   * refused it and the user has to rely on the environment instead — worth
   * saying out loud rather than pretending the password was saved.
   */
  async save(config: RemoteConfig, password: string): Promise<boolean> {
    const secret = await this.#namespace()
    if (!secret?.passwordStoreSync) return false

    try {
      return secret.passwordStoreSync(
        this.#schema(secret),
        attributesOf(config),
        secret.COLLECTION_DEFAULT,
        KEYRING_LABEL,
        password,
        null,
      )
    } catch {
      return false
    }
  }

  /** Forgets the password for this account. Silent when there was none. */
  async remove(config: RemoteConfig): Promise<void> {
    const secret = await this.#namespace()
    if (!secret?.passwordClearSync) return

    try {
      secret.passwordClearSync(this.#schema(secret), attributesOf(config), null)
    } catch {
      // Nothing to forget, or nowhere to forget it from.
    }
  }

  /** Whether a password is available at all, without revealing it. */
  async has(config: RemoteConfig): Promise<boolean> {
    const { password } = await this.load(config)
    return password !== ''
  }

  #namespace(): Promise<SecretNamespace | null> {
    this.#secret ??= this.#loadSecret().then(
      (namespace) => namespace,
      () => null, // typelib absent: expected, not exceptional
    )
    return this.#secret
  }

  #schema(secret: SecretNamespace): unknown {
    return secret.Schema.new(SCHEMA_NAME, secret.SchemaFlags.NONE, {
      server: secret.SchemaAttributeType.STRING,
      username: secret.SchemaAttributeType.STRING,
    })
  }

  #fromEnvironment(): string | null {
    for (const name of PASSWORD_ENV_VARS) {
      const value = this.#env[name]
      if (value !== undefined && value !== '') return value
    }
    return null
  }
}

/** The pair identifying one account: the same server, the same user, one password. */
function attributesOf(config: RemoteConfig): Record<string, string> {
  return { server: normalizeBaseUrl(config.baseUrl), username: config.username.trim() }
}
