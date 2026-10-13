/*
 * data/secure-store.ts — keeps secrets (passwords) on this machine, permanently.
 *
 * The first backend that works on the current machine is used, in this order:
 *
 *   1. the freedesktop Secret Service through libsecret (GNOME Keyring, KWallet…);
 *   2. the macOS Keychain through the `security` command line tool;
 *   3. the Windows Data Protection API (DPAPI) through PowerShell, which ties the
 *      ciphertext to the current Windows account;
 *   4. an AES-256-GCM encrypted file in the data directory, whose key lives in a
 *      separate file readable only by the user.
 *
 * Secrets never land in the JSON settings files, in logs or in backups. Every
 * backend answers `''` for a missing secret and `false` when it could not keep it.
 */
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { loadSecretNamespace, type SecretLoader, type SecretNamespace } from './bank/secret.js'
import { writeFileAtomic } from './atomic-write.js'
import { DATA_DIR } from './paths.js'

export type SecureStoreBackendName = 'keyring' | 'keychain' | 'dpapi' | 'encrypted-file'

/** Where a secret belongs: the schema/service and the attributes identifying one account. */
export interface SecretAccount {
  /** Keyring schema and keychain service, e.g. `org.gtk.budget-app.Calendar`. */
  schema: string
  /** Human label shown by keyring managers. */
  label: string
  /** Attributes identifying the account; values are normalized by the caller. */
  attributes: Record<string, string>
}

export interface SecureStoreBackend {
  readonly name: SecureStoreBackendName
  /** `false` when the backend cannot work on this machine at all. */
  available(): Promise<boolean>
  load(account: SecretAccount): Promise<string>
  save(account: SecretAccount, secret: string): Promise<boolean>
}

/** Stable identifier of an account across backends that only know a single key. */
export function accountId(account: SecretAccount): string {
  const attributes = Object.keys(account.attributes).sort()
    .map((key) => `${key}=${account.attributes[key] ?? ''}`)
  return [account.schema, ...attributes].join('\n')
}

/* --- 1. libsecret -------------------------------------------------------- */

export class KeyringBackend implements SecureStoreBackend {
  readonly name = 'keyring' as const
  #secret?: Promise<SecretNamespace | null>

  constructor(private readonly loadSecret: SecretLoader = loadSecretNamespace) {}

  async available(): Promise<boolean> {
    const secret = await this.namespace()
    return secret?.passwordLookupSync !== undefined && secret.passwordStoreSync !== undefined
  }

  async load(account: SecretAccount): Promise<string> {
    const secret = await this.namespace()
    return secret?.passwordLookupSync?.(this.schema(secret, account), account.attributes, null) ?? ''
  }

  async save(account: SecretAccount, password: string): Promise<boolean> {
    const secret = await this.namespace()
    if (!secret?.passwordStoreSync) return false
    return secret.passwordStoreSync(
      this.schema(secret, account), account.attributes, secret.COLLECTION_DEFAULT, account.label, password, null,
    )
  }

  private namespace(): Promise<SecretNamespace | null> {
    this.#secret ??= this.loadSecret().then((secret) => secret, () => null)
    return this.#secret
  }

  private schema(secret: SecretNamespace, account: SecretAccount): unknown {
    const types: Record<string, number> = {}
    for (const key of Object.keys(account.attributes)) types[key] = secret.SchemaAttributeType.STRING
    return secret.Schema.new(account.schema, secret.SchemaFlags.NONE, types)
  }
}

/* --- 2. macOS Keychain --------------------------------------------------- */

export type CommandRunner = (file: string, args: string[], input?: string) => string

const runCommand: CommandRunner = (file, args, input) =>
  execFileSync(file, args, { encoding: 'utf-8', input, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, timeout: 15_000 })

export class KeychainBackend implements SecureStoreBackend {
  readonly name = 'keychain' as const

  constructor(private readonly run: CommandRunner = runCommand, private readonly platform: string = process.platform) {}

  async available(): Promise<boolean> {
    if (this.platform !== 'darwin') return false
    try {
      this.run('security', ['help'])
      return true
    } catch {
      return false
    }
  }

  async load(account: SecretAccount): Promise<string> {
    try {
      return this.run('security', ['find-generic-password', '-a', accountId(account), '-s', account.schema, '-w']).replace(/\r?\n$/, '')
    } catch {
      // `security` exits with 44 when the item does not exist
      return ''
    }
  }

  async save(account: SecretAccount, password: string): Promise<boolean> {
    try {
      this.run('security', ['add-generic-password', '-U', '-a', accountId(account), '-s', account.schema, '-l', account.label, '-w', password])
      return true
    } catch {
      return false
    }
  }
}

/* --- 3. and 4. Encrypted entries in the data directory ------------------- */

/** The ciphertexts; the file never contains anything usable without the user's session or key file. */
export const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json')
/** Random key of the encrypted-file backend; created on first use, readable only by the user. */
export const SECRETS_KEY_FILE = path.join(DATA_DIR, 'secrets.key')

interface SecretsFile { version: 1; entries: Record<string, StoredEntry> }
interface StoredEntry { backend: 'dpapi' | 'encrypted-file'; data: string; iv?: string; tag?: string }

function readEntries(file: string): Record<string, StoredEntry> {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (typeof parsed !== 'object' || parsed === null || !('entries' in parsed)) return {}
    const entries = (parsed as { entries: unknown }).entries
    return typeof entries === 'object' && entries !== null ? entries as Record<string, StoredEntry> : {}
  } catch {
    return {}
  }
}

function writeEntries(file: string, entries: Record<string, StoredEntry>): void {
  const contents: SecretsFile = { version: 1, entries }
  writeFileAtomic(file, JSON.stringify(contents, null, 2) + '\n')
}

/** Reads or creates the random key used by the encrypted-file backend. */
function keyFromFile(file: string): Buffer {
  try {
    const key = Buffer.from(fs.readFileSync(file, 'utf-8').trim(), 'base64')
    if (key.length === 32) return key
  } catch {
    // no key yet
  }
  const key = crypto.randomBytes(32)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, key.toString('base64') + '\n', { encoding: 'utf-8', mode: 0o600 })
  return key
}

abstract class FileBackedBackend implements SecureStoreBackend {
  abstract readonly name: SecureStoreBackendName
  protected abstract readonly entryBackend: StoredEntry['backend']

  constructor(protected readonly file: string = SECRETS_FILE) {}

  abstract available(): Promise<boolean>
  protected abstract encrypt(secret: string): StoredEntry
  protected abstract decrypt(entry: StoredEntry): string

  async load(account: SecretAccount): Promise<string> {
    const entry = readEntries(this.file)[accountId(account)]
    if (entry === undefined || entry.backend !== this.entryBackend) return ''
    try {
      return this.decrypt(entry)
    } catch {
      return ''
    }
  }

  async save(account: SecretAccount, secret: string): Promise<boolean> {
    try {
      const entries = readEntries(this.file)
      if (secret === '') delete entries[accountId(account)]
      else entries[accountId(account)] = this.encrypt(secret)
      writeEntries(this.file, entries)
      return true
    } catch {
      return false
    }
  }
}

const PROTECT_SCRIPT = [
  'Add-Type -AssemblyName System.Security',
  '$in = [Console]::In.ReadToEnd().Trim()',
  '$bytes = [Convert]::FromBase64String($in)',
  '$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser',
].join('; ')

const dpapiScript = (direction: 'Protect' | 'Unprotect'): string =>
  `${PROTECT_SCRIPT}; $out = [Security.Cryptography.ProtectedData]::${direction}($bytes, $null, $scope); [Console]::Out.Write([Convert]::ToBase64String($out))`

/** Windows DPAPI: the ciphertext can only be opened by the same Windows user on the same machine. */
export class DpapiBackend extends FileBackedBackend {
  readonly name = 'dpapi' as const
  protected readonly entryBackend = 'dpapi' as const

  constructor(file: string = SECRETS_FILE, private readonly run: CommandRunner = runCommand, private readonly platform: string = process.platform) {
    super(file)
  }

  async available(): Promise<boolean> {
    if (this.platform !== 'win32') return false
    try {
      // Fails under PowerShell Constrained Language mode, where .NET types cannot be called.
      const probe = Buffer.from('probe').toString('base64')
      const protectedProbe = this.powershell('Protect', probe)
      return this.powershell('Unprotect', protectedProbe) === probe
    } catch {
      return false
    }
  }

  protected encrypt(secret: string): StoredEntry {
    return { backend: 'dpapi', data: this.powershell('Protect', Buffer.from(secret, 'utf-8').toString('base64')) }
  }

  protected decrypt(entry: StoredEntry): string {
    return Buffer.from(this.powershell('Unprotect', entry.data), 'base64').toString('utf-8')
  }

  private powershell(direction: 'Protect' | 'Unprotect', base64: string): string {
    const output = this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', dpapiScript(direction)], base64 + '\n').trim()
    if (output === '' || !/^[A-Za-z0-9+/=]+$/.test(output)) throw new Error('DPAPI returned no data')
    return output
  }
}

/** Last resort: AES-256-GCM with a random key kept in a user-only file next to the data. */
export class EncryptedFileBackend extends FileBackedBackend {
  readonly name = 'encrypted-file' as const
  protected readonly entryBackend = 'encrypted-file' as const
  #key?: Buffer

  constructor(file: string = SECRETS_FILE, private readonly keyFile: string = SECRETS_KEY_FILE) {
    super(file)
  }

  async available(): Promise<boolean> {
    try {
      this.key()
      return true
    } catch {
      return false
    }
  }

  protected encrypt(secret: string): StoredEntry {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv)
    const data = Buffer.concat([cipher.update(secret, 'utf-8'), cipher.final()])
    return { backend: 'encrypted-file', iv: iv.toString('base64'), data: data.toString('base64'), tag: cipher.getAuthTag().toString('base64') }
  }

  protected decrypt(entry: StoredEntry): string {
    if (entry.iv === undefined || entry.tag === undefined) throw new Error('Malformed entry')
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key(), Buffer.from(entry.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(entry.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(entry.data, 'base64')), decipher.final()]).toString('utf-8')
  }

  private key(): Buffer {
    this.#key ??= keyFromFile(this.keyFile)
    return this.#key
  }
}

/* --- The chain ------------------------------------------------------------ */

export function defaultBackends(loadSecret: SecretLoader = loadSecretNamespace): SecureStoreBackend[] {
  return [new KeyringBackend(loadSecret), new KeychainBackend(), new DpapiBackend(), new EncryptedFileBackend()]
}

/** Picks the first working backend once and remembers decrypted secrets for the process lifetime. */
export class SecureStore {
  #backend?: Promise<SecureStoreBackend | null>
  readonly #cache = new Map<string, string>()

  constructor(private readonly backends: SecureStoreBackend[] = defaultBackends()) {}

  /** The backend in use, or `null` when nothing on this machine can keep a secret. */
  async backendName(): Promise<SecureStoreBackendName | null> {
    return (await this.backend())?.name ?? null
  }

  async load(account: SecretAccount): Promise<string> {
    const id = accountId(account)
    const cached = this.#cache.get(id)
    if (cached !== undefined) return cached
    const backend = await this.backend()
    const secret = (await backend?.load(account)) ?? ''
    if (secret !== '') this.#cache.set(id, secret)
    return secret
  }

  async save(account: SecretAccount, secret: string): Promise<boolean> {
    const backend = await this.backend()
    if (backend === null) return false
    const saved = await backend.save(account, secret)
    if (saved) {
      if (secret === '') this.#cache.delete(accountId(account))
      else this.#cache.set(accountId(account), secret)
    }
    return saved
  }

  private backend(): Promise<SecureStoreBackend | null> {
    this.#backend ??= (async () => {
      for (const backend of this.backends) {
        try {
          if (await backend.available()) return backend
        } catch {
          // try the next one
        }
      }
      return null
    })()
    return this.#backend
  }
}
