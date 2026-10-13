import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTempUserDataDir, removeTempUserDataDir, type TempDataDir } from '../helpers/temp-data-dir.js'

const account = { schema: 'org.test.Schema', label: 'Test', attributes: { calendar: 'https://dav.test/cal', username: 'alice' } }
let temp: TempDataDir
beforeEach(() => { temp = createTempUserDataDir() })
afterEach(() => { vi.restoreAllMocks(); removeTempUserDataDir(temp) })

const secureStore = () => import('../../src/data/secure-store.js')

describe('accountId', () => {
  it('orders the attributes and tolerates a missing value', async () => {
    const { accountId } = await secureStore()
    expect(accountId(account)).toBe('org.test.Schema\ncalendar=https://dav.test/cal\nusername=alice')
    expect(accountId({ ...account, attributes: { b: '2', a: undefined as unknown as string } })).toBe('org.test.Schema\na=\nb=2')
  })
})

describe('libsecret keyring backend', () => {
  const namespace = (overrides: Record<string, unknown> = {}) => ({
    Schema: { new: () => 'schema' }, SchemaFlags: { NONE: 0 }, SchemaAttributeType: { STRING: 0 }, COLLECTION_DEFAULT: 'default',
    passwordLookupSync: () => 'stored', passwordStoreSync: () => true, ...overrides,
  })
  it('is unavailable when the typelib cannot be loaded, and loads it only once', async () => {
    const { KeyringBackend } = await secureStore()
    const loader = vi.fn(async () => { throw new Error('Missing typelib') })
    const backend = new KeyringBackend(loader)
    await expect(backend.available()).resolves.toBe(false)
    await expect(backend.load(account)).resolves.toBe('')
    await expect(backend.save(account, 'x')).resolves.toBe(false)
    expect(loader).toHaveBeenCalledTimes(1)
  })
  it('is unavailable when the namespace lacks the password functions', async () => {
    const { KeyringBackend } = await secureStore()
    const noStore = new KeyringBackend(async () => namespace({ passwordStoreSync: undefined }) as never)
    await expect(noStore.available()).resolves.toBe(false)
    await expect(noStore.load(account)).resolves.toBe('stored')
    await expect(noStore.save(account, 'x')).resolves.toBe(false)
    const noLookup = new KeyringBackend(async () => namespace({ passwordLookupSync: undefined }) as never)
    await expect(noLookup.available()).resolves.toBe(false)
    await expect(noLookup.load(account)).resolves.toBe('')
  })
  it('round-trips through the stubbed keyring by default', async () => {
    const { KeyringBackend } = await secureStore()
    const { clearStubbedKeyring } = await import('../helpers/secret-stub.js')
    clearStubbedKeyring()
    const backend = new KeyringBackend()
    await expect(backend.available()).resolves.toBe(true)
    await expect(backend.load(account)).resolves.toBe('')
    await expect(backend.save(account, 'secret')).resolves.toBe(true)
    await expect(backend.load(account)).resolves.toBe('secret')
    clearStubbedKeyring()
  })
})

describe('encrypted file backend', () => {
  it('creates a user-only key file and round-trips secrets without storing them in clear', async () => {
    const { EncryptedFileBackend } = await secureStore()
    const backend = new EncryptedFileBackend()
    await expect(backend.available()).resolves.toBe(true)
    await expect(backend.load(account)).resolves.toBe('')
    await expect(backend.save(account, 'p@ss wörd')).resolves.toBe(true)
    await expect(backend.load(account)).resolves.toBe('p@ss wörd')
    const secrets = fs.readFileSync(path.join(temp.dataDir, 'secrets.json'), 'utf8')
    expect(secrets).not.toContain('p@ss')
    expect(JSON.parse(secrets).entries[Object.keys(JSON.parse(secrets).entries)[0]].backend).toBe('encrypted-file')
    if (process.platform !== 'win32') {
      expect(fs.statSync(path.join(temp.dataDir, 'secrets.key')).mode & 0o777).toBe(0o600)
    }
    await expect(backend.save(account, '')).resolves.toBe(true)
    await expect(backend.load(account)).resolves.toBe('')
  })
  it('answers empty when the key changed or the file is corrupted', async () => {
    const { EncryptedFileBackend } = await secureStore()
    await new EncryptedFileBackend().save(account, 'secret')
    fs.rmSync(path.join(temp.dataDir, 'secrets.key'))
    await expect(new EncryptedFileBackend().load(account)).resolves.toBe('')
    fs.writeFileSync(path.join(temp.dataDir, 'secrets.json'), '{ not json')
    await expect(new EncryptedFileBackend().load(account)).resolves.toBe('')
  })
  it.each(['null', '[]', '{ "entries": 5 }', '{ "version": 1 }'])('treats the secrets file %s as empty', async (contents) => {
    const { EncryptedFileBackend } = await secureStore()
    fs.mkdirSync(temp.dataDir, { recursive: true })
    fs.writeFileSync(path.join(temp.dataDir, 'secrets.json'), contents)
    await expect(new EncryptedFileBackend().load(account)).resolves.toBe('')
  })
  it('answers empty for an entry missing its nonce or tag', async () => {
    const { EncryptedFileBackend, accountId } = await secureStore()
    fs.mkdirSync(temp.dataDir, { recursive: true })
    fs.writeFileSync(path.join(temp.dataDir, 'secrets.json'), JSON.stringify({ version: 1, entries: { [accountId(account)]: { backend: 'encrypted-file', data: 'AAAA' } } }))
    await expect(new EncryptedFileBackend().load(account)).resolves.toBe('')
  })
  it('is unavailable when the key file cannot be created, and reports a failed write', async () => {
    const { EncryptedFileBackend } = await secureStore()
    fs.mkdirSync(temp.dataDir, { recursive: true })
    const blocker = path.join(temp.dataDir, 'blocker')
    fs.writeFileSync(blocker, 'not a directory')
    await expect(new EncryptedFileBackend(undefined, path.join(blocker, 'secrets.key')).available()).resolves.toBe(false)
    await expect(new EncryptedFileBackend(temp.dataDir).save(account, 'secret')).resolves.toBe(false)
  })
})

describe('macOS keychain backend', () => {
  it('is unavailable off macOS and talks to the security tool otherwise', async () => {
    const { KeychainBackend, accountId } = await secureStore()
    const calls: string[][] = []
    const run = vi.fn((_file: string, args: string[]) => {
      calls.push(args)
      if (args[0] === 'find-generic-password') return 'stored\n'
      return ''
    })
    await expect(new KeychainBackend(run, 'linux').available()).resolves.toBe(false)
    const backend = new KeychainBackend(run, 'darwin')
    await expect(backend.available()).resolves.toBe(true)
    await expect(backend.load(account)).resolves.toBe('stored')
    expect(calls[1]).toEqual(['find-generic-password', '-a', accountId(account), '-s', account.schema, '-w'])
    await expect(backend.save(account, 'new')).resolves.toBe(true)
    expect(calls[2]).toEqual(['add-generic-password', '-U', '-a', accountId(account), '-s', account.schema, '-l', 'Test', '-w', 'new'])
  })
  it('reports a missing item as no password and a failed write as not saved', async () => {
    const { KeychainBackend } = await secureStore()
    const backend = new KeychainBackend(() => { throw new Error('exit 44') }, 'darwin')
    await expect(backend.available()).resolves.toBe(false)
    await expect(backend.load(account)).resolves.toBe('')
    await expect(backend.save(account, 'x')).resolves.toBe(false)
  })
  it('runs the real security tool by default', async () => {
    const { KeychainBackend } = await secureStore()
    // Off macOS the tool does not exist; on macOS the item does not. Either way: no password.
    await expect(new KeychainBackend(undefined, 'darwin').load({ ...account, schema: 'org.test.Missing' })).resolves.toBe('')
  })
})

describe('Windows DPAPI backend', () => {
  /** A stand-in for PowerShell: prefixes the payload to "protect" it. */
  const fakePowershell = (_file: string, args: string[], input?: string): string => {
    const payload = Buffer.from((input ?? '').trim(), 'base64').toString('latin1')
    const protect = args.join(' ').includes('::Protect(')
    return Buffer.from(protect ? 'P:' + payload : payload.slice(2), 'latin1').toString('base64')
  }
  it('is unavailable off Windows or when PowerShell cannot use .NET', async () => {
    const { DpapiBackend } = await secureStore()
    await expect(new DpapiBackend(undefined, fakePowershell, 'linux').available()).resolves.toBe(false)
    const constrained = () => { throw new Error('MethodInvocationNotSupportedInConstrainedLanguage') }
    await expect(new DpapiBackend(undefined, constrained, 'win32').available()).resolves.toBe(false)
    const garbage = () => 'Impossible d\u2019appeler la m\u00e9thode'
    await expect(new DpapiBackend(undefined, garbage, 'win32').available()).resolves.toBe(false)
  })
  it('stores DPAPI ciphertext in the secrets file and reads it back', async () => {
    const { DpapiBackend } = await secureStore()
    const backend = new DpapiBackend(undefined, fakePowershell, 'win32')
    await expect(backend.available()).resolves.toBe(true)
    await expect(backend.save(account, 'secret')).resolves.toBe(true)
    const file = fs.readFileSync(path.join(temp.dataDir, 'secrets.json'), 'utf8')
    expect(file).not.toContain('secret')
    expect(file).toContain('"backend": "dpapi"')
    await expect(backend.load(account)).resolves.toBe('secret')
  })
})

describe('secure store chain', () => {
  it('uses the first available backend, caches secrets and reports the backend name', async () => {
    const { SecureStore } = await secureStore()
    const unavailable = { name: 'keyring' as const, available: vi.fn(async () => false), load: vi.fn(), save: vi.fn() }
    const failing = { name: 'keychain' as const, available: vi.fn(async () => { throw new Error('boom') }), load: vi.fn(), save: vi.fn() }
    const working = {
      name: 'encrypted-file' as const, available: vi.fn(async () => true),
      load: vi.fn(async () => 'from-backend'), save: vi.fn(async () => true),
    }
    const store = new SecureStore([unavailable, failing, working])
    await expect(store.backendName()).resolves.toBe('encrypted-file')
    await expect(store.load(account)).resolves.toBe('from-backend')
    await expect(store.load(account)).resolves.toBe('from-backend')
    expect(working.load).toHaveBeenCalledTimes(1)
    await expect(store.save(account, 'updated')).resolves.toBe(true)
    await expect(store.load(account)).resolves.toBe('updated')
    expect(unavailable.load).not.toHaveBeenCalled()
    expect(failing.load).not.toHaveBeenCalled()
    await expect(store.save(account, '')).resolves.toBe(true)
    await expect(store.load(account)).resolves.toBe('from-backend')
    expect(working.load).toHaveBeenCalledTimes(2)
  })
  it('does not cache a secret the backend refused to keep', async () => {
    const { SecureStore } = await secureStore()
    const refusing = { name: 'keyring' as const, available: vi.fn(async () => true), load: vi.fn(async () => ''), save: vi.fn(async () => false) }
    const store = new SecureStore([refusing])
    await expect(store.save(account, 'x')).resolves.toBe(false)
    await expect(store.load(account)).resolves.toBe('')
    await expect(store.load(account)).resolves.toBe('')
    expect(refusing.load).toHaveBeenCalledTimes(2)
  })
  it('builds the default chain from the keyring down to the encrypted file', async () => {
    const { defaultBackends } = await secureStore()
    expect(defaultBackends().map((backend) => backend.name)).toEqual(['keyring', 'keychain', 'dpapi', 'encrypted-file'])
  })
  it('cannot save when no backend works', async () => {
    const { SecureStore } = await secureStore()
    const store = new SecureStore([])
    await expect(store.backendName()).resolves.toBeNull()
    await expect(store.load(account)).resolves.toBe('')
    await expect(store.save(account, 'x')).resolves.toBe(false)
  })
})
