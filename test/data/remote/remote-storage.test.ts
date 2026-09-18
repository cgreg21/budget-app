/*
 * Exercises the sync engine against a fake provider: what it does on the
 * first connection to an empty account, how it lets the server overrule the
 * cache afterwards, and the rule everything else depends on — a budget that
 * cannot reach its server cannot be modified.
 *
 * The provider is a plain in-memory map, so "the server" can be inspected
 * directly and made to fail in the two ways that matter: refusing (a wrong
 * password, which retrying will not fix) and not answering (a dropped
 * connection, which retrying might).
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CredentialStore } from '../../../src/data/remote/credentials.js'
import type { RemoteEntry, RemoteProvider } from '../../../src/data/remote/provider.js'
import type { RemoteConfig } from '../../../src/domain/remote.js'
import {
  createTempUserDataDir,
  removeTempUserDataDir,
  writeJson,
  writeText,
  type TempDataDir,
} from '../../helpers/temp-data-dir.js'

type StorageModule = typeof import('../../../src/data/remote/remote-storage.js')
type ConfigStoreModule = typeof import('../../../src/data/remote/remote-config-store.js')
type ProviderModule = typeof import('../../../src/data/remote/provider.js')

const SERVER: Omit<RemoteConfig, 'enabled'> = {
  provider: 'webdav',
  baseUrl: 'https://cloud.example.org/dav',
  username: 'alice',
  remoteDir: 'budget-app',
}

/** An in-memory server: a flat map of remote paths to contents. */
class FakeProvider implements RemoteProvider {
  readonly label = 'Fake'
  readonly files = new Map<string, string>()
  readonly directories: string[] = []
  probeError: unknown
  writeError: unknown
  removeError: unknown

  probe(): Promise<void> {
    return this.probeError ? Promise.reject(this.probeError) : Promise.resolve()
  }

  list(remotePath: string): Promise<RemoteEntry[]> {
    const prefix = `${remotePath}/`
    const entries = [...this.files.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => ({ name: key.slice(prefix.length), isDirectory: false }))
    return Promise.resolve(entries)
  }

  read(remotePath: string): Promise<string | null> {
    return Promise.resolve(this.files.get(remotePath) ?? null)
  }

  write(remotePath: string, contents: string): Promise<void> {
    if (this.writeError) return Promise.reject(this.writeError)
    this.files.set(remotePath, contents)
    return Promise.resolve()
  }

  remove(remotePath: string): Promise<void> {
    if (this.removeError) return Promise.reject(this.removeError)
    this.files.delete(remotePath)
    return Promise.resolve()
  }

  ensureDirectory(remotePath: string): Promise<void> {
    this.directories.push(remotePath)
    return Promise.resolve()
  }
}

let temp: TempDataDir
let provider: FakeProvider
let modules: {
  storage: StorageModule
  configStore: ConfigStoreModule
  provider: ProviderModule
}

/**
 * `vi.resetModules()` gives each test its own copy of the module graph, so
 * the engine's `instanceof RemoteRequestError` only recognises the class from
 * that same copy — hence going through the dynamically imported module rather
 * than importing the class at the top of the file.
 */
function refusal(message: string, status = 401): Error {
  return new modules.provider.RemoteRequestError(message, status)
}

/** A server that is simply not answering, as `fetch` reports it. */
function unreachable(): Error {
  return new TypeError('fetch failed')
}

interface Harness {
  storage: InstanceType<StorageModule['RemoteStorage']>
  configs: InstanceType<ConfigStoreModule['RemoteConfigStore']>
  onSynced: ReturnType<typeof vi.fn>
}

const disposables: { dispose: () => void }[] = []

interface HarnessOptions {
  enabled?: boolean
  password?: string
  retryDelayMs?: number
}

async function createStorage({
  enabled = true,
  password = 's3cret',
  retryDelayMs = 0,
}: HarnessOptions = {}): Promise<Harness> {
  const configs = new modules.configStore.RemoteConfigStore()
  configs.save({ ...SERVER, enabled })

  const credentials = new CredentialStore({
    loadSecret: () => Promise.reject(new Error('no typelib')),
    env: password === '' ? {} : { BUDGET_APP_REMOTE_PASSWORD: password },
  })

  const onSynced = vi.fn()
  const storage = new modules.storage.RemoteStorage({
    configStore: configs,
    credentials,
    createProvider: () => provider,
    onSynced,
    retryDelayMs,
  })

  disposables.push(configs, storage)
  return { storage, configs, onSynced }
}

function localPath(...segments: string[]): string {
  return path.join(temp.dataDir, ...segments)
}

function readLocal(...segments: string[]): string {
  return fs.readFileSync(localPath(...segments), 'utf-8')
}

beforeEach(async () => {
  temp = createTempUserDataDir()
  provider = new FakeProvider()
  modules = {
    storage: await import('../../../src/data/remote/remote-storage.js'),
    configStore: await import('../../../src/data/remote/remote-config-store.js'),
    provider: await import('../../../src/data/remote/provider.js'),
  }
})

afterEach(() => {
  for (const disposable of disposables.splice(0)) disposable.dispose()
  removeTempUserDataDir(temp)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('connect', () => {
  it('stays local when no server is switched on', async () => {
    const { storage, onSynced } = await createStorage({ enabled: false })
    await storage.connect()

    expect(storage.status).toEqual({ state: 'disabled' })
    expect(onSynced).not.toHaveBeenCalled()
  })

  it('reports an account with no password rather than trying', async () => {
    const { storage } = await createStorage({ password: '' })
    await storage.connect()

    expect(storage.status).toMatchObject({
      state: 'error',
      message: 'Aucun mot de passe enregistré pour ce compte',
    })
  })

  it('reports a server that refused', async () => {
    provider.probeError = refusal('identifiants refusés')
    const { storage } = await createStorage()
    await storage.connect()

    expect(storage.status).toMatchObject({ state: 'error', message: 'identifiants refusés' })
  })

  it('goes offline when the server does not answer at all', async () => {
    provider.probeError = unreachable()
    const { storage } = await createStorage()
    await storage.connect()

    expect(storage.status.state).toBe('offline')
  })

  it('records when the cache was last filled', async () => {
    provider.files.set('budget-app/categories.json', '[]')
    const { storage, onSynced } = await createStorage()
    await storage.connect()

    expect(storage.status.state).toBe('online')
    expect(storage.status.lastSyncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(onSynced).toHaveBeenCalledOnce()
  })

  it('notifies subscribers as it goes', async () => {
    provider.files.set('budget-app/categories.json', '[]')
    const { storage } = await createStorage()
    const states: string[] = []
    storage.onStatusChange(() => states.push(storage.status.state))

    await storage.connect()

    expect(states).toEqual(['connecting', 'online'])
  })

  it('lets a subscriber leave', async () => {
    const { storage } = await createStorage({ enabled: false })
    const listener = vi.fn()
    storage.onStatusChange(listener)()

    await storage.connect()

    expect(listener).not.toHaveBeenCalled()
  })

  it('exposes the configuration it works from', async () => {
    const { storage } = await createStorage()
    expect(storage.config).toMatchObject({ baseUrl: SERVER.baseUrl, username: 'alice' })
  })
})

describe('first connection to an empty account', () => {
  it('uploads the local budget rather than erasing it', async () => {
    writeJson(localPath('categories.json'), [{ name: 'Courses', icon: 'x' }])
    writeJson(localPath('months', '2026-09.json'), [{ id: '1' }])

    const { storage } = await createStorage()
    await storage.connect()

    expect(provider.files.get('budget-app/categories.json')).toContain('Courses')
    expect(provider.files.get('budget-app/months/2026-09.json')).toContain('"1"')
    expect(storage.status.state).toBe('online')
  })

  it('creates the months directory on the way', async () => {
    const { storage } = await createStorage()
    await storage.connect()

    expect(provider.directories).toContain('budget-app/months')
  })

  it('uploads nothing when there is nothing to upload', async () => {
    const { storage } = await createStorage()
    await storage.connect()

    expect(provider.files.size).toBe(0)
    expect(storage.status.state).toBe('online')
  })

  it('ignores local files that are not part of the budget', async () => {
    writeJson(localPath('notes.json'), { kept: true })
    writeText(localPath('months', 'notes.txt'), 'x')

    const { storage } = await createStorage()
    await storage.connect()

    expect([...provider.files.keys()]).toEqual([])
  })
})

describe('filling the cache from the server', () => {
  it('overwrites the local settings with the remote ones', async () => {
    writeJson(localPath('categories.json'), [{ name: 'Local' }])
    provider.files.set('budget-app/categories.json', '[{"name":"Distant"}]')

    const { storage } = await createStorage()
    await storage.connect()

    expect(readLocal('categories.json')).toBe('[{"name":"Distant"}]')
  })

  it('uploads a settings file the server does not have yet', async () => {
    provider.files.set('budget-app/categories.json', '[]')
    writeJson(localPath('thresholds.json'), { low: 1 })

    const { storage } = await createStorage()
    await storage.connect()

    expect(provider.files.get('budget-app/thresholds.json')).toContain('"low"')
  })

  it('downloads the months the server holds', async () => {
    provider.files.set('budget-app/months/2026-09.json', '[{"id":"remote"}]')

    const { storage } = await createStorage()
    await storage.connect()

    expect(readLocal('months', '2026-09.json')).toBe('[{"id":"remote"}]')
  })

  it('deletes the months the server no longer has', async () => {
    writeJson(localPath('months', '2026-08.json'), [{ id: 'old' }])
    provider.files.set('budget-app/months/2026-09.json', '[]')

    const { storage } = await createStorage()
    await storage.connect()

    expect(fs.existsSync(localPath('months', '2026-08.json'))).toBe(false)
    expect(fs.existsSync(localPath('months', '2026-09.json'))).toBe(true)
  })

  it('leaves files it does not manage alone', async () => {
    writeJson(localPath('notes.json'), { kept: true })
    writeText(localPath('months', 'notes.txt'), 'garder')
    provider.files.set('budget-app/categories.json', '[]')

    const { storage } = await createStorage()
    await storage.connect()

    expect(fs.existsSync(localPath('notes.json'))).toBe(true)
    expect(readLocal('months', 'notes.txt')).toBe('garder')
  })

  it('does not rewrite a file whose contents already match', async () => {
    writeText(localPath('categories.json'), '[]')
    provider.files.set('budget-app/categories.json', '[]')
    const write = vi.spyOn(fs, 'writeFileSync')

    const { storage } = await createStorage()
    await storage.connect()

    expect(write).not.toHaveBeenCalledWith(localPath('categories.json'), expect.anything(), expect.anything())
  })

  it('skips a listed month that cannot be read back', async () => {
    provider.files.set('budget-app/categories.json', '[]')
    provider.files.set('budget-app/months/2026-09.json', '[]')
    vi.spyOn(provider, 'read').mockImplementation((remotePath: string) =>
      Promise.resolve(remotePath.includes('months') ? null : '[]'))

    const { storage } = await createStorage()
    await storage.connect()

    expect(fs.existsSync(localPath('months', '2026-09.json'))).toBe(false)
    expect(storage.status.state).toBe('online')
  })

  it('ignores remote entries that are not months', async () => {
    provider.files.set('budget-app/categories.json', '[]')
    vi.spyOn(provider, 'list').mockResolvedValue([
      { name: 'archive', isDirectory: true },
      { name: 'notes.txt', isDirectory: false },
      { name: '2026-13.json', isDirectory: false },
    ])

    const { storage } = await createStorage()
    await storage.connect()

    expect(fs.existsSync(localPath('months'))).toBe(false)
    expect(storage.status.state).toBe('online')
  })
})

describe('assertWritable', () => {
  it('allows everything when no server is configured', async () => {
    const { storage } = await createStorage({ enabled: false })
    await storage.connect()

    expect(() => storage.assertWritable()).not.toThrow()
  })

  it('allows everything once connected', async () => {
    const { storage } = await createStorage()
    await storage.connect()

    expect(() => storage.assertWritable()).not.toThrow()
  })

  it('refuses while the server is silent', async () => {
    provider.probeError = unreachable()
    const { storage } = await createStorage()
    await storage.connect()

    expect(() => storage.assertWritable()).toThrow('Hors ligne — le budget est en lecture seule')
  })

  it('repeats what the server said when it refused', async () => {
    provider.probeError = refusal('identifiants refusés')
    const { storage } = await createStorage()
    await storage.connect()

    expect(() => storage.assertWritable())
      .toThrow('Serveur inaccessible — budget en lecture seule (identifiants refusés)')
  })

  it('refuses before the first connection has settled', async () => {
    const { storage } = await createStorage()
    const pending = storage.connect()

    expect(() => storage.assertWritable()).toThrow()
    await pending
  })
})

describe('pushFile', () => {
  it('mirrors a settings file', async () => {
    const { storage } = await createStorage()
    await storage.connect()

    writeText(localPath('categories.json'), '[{"name":"Courses"}]')
    storage.pushFile(localPath('categories.json'))
    await storage.flush()

    expect(provider.files.get('budget-app/categories.json')).toBe('[{"name":"Courses"}]')
  })

  it('mirrors a month file', async () => {
    const { storage } = await createStorage()
    await storage.connect()

    writeText(localPath('months', '2026-09.json'), '[]')
    storage.pushFile(localPath('months', '2026-09.json'))
    await storage.flush()

    expect(provider.files.get('budget-app/months/2026-09.json')).toBe('[]')
  })

  it.each([
    ['a stray file in the data directory', ['notes.json']],
    ['the server settings', ['remote.json']],
    ['a stray file in months', ['months', 'notes.txt']],
    ['a file nested too deep', ['months', '2026', '09.json']],
    ['a month with an impossible name', ['months', '2026-13.json']],
  ])('ignores %s', async (_label, segments) => {
    const { storage } = await createStorage()
    await storage.connect()

    writeText(localPath(...segments), '{}')
    storage.pushFile(localPath(...segments))
    await storage.flush()

    expect(provider.files.size).toBe(0)
  })

  it('ignores a path outside the data directory', async () => {
    const { storage } = await createStorage()
    await storage.connect()

    storage.pushFile(path.join(temp.root, 'ailleurs.json'))
    await storage.flush()

    expect(provider.files.size).toBe(0)
  })

  it('ignores the data directory itself', async () => {
    const { storage } = await createStorage()
    await storage.connect()

    storage.pushFile(temp.dataDir)
    await storage.flush()

    expect(provider.files.size).toBe(0)
  })

  it('gives up quietly on a file that vanished', async () => {
    const { storage } = await createStorage()
    await storage.connect()

    storage.pushFile(localPath('categories.json'))
    await storage.flush()

    expect(provider.files.size).toBe(0)
    expect(storage.status.state).toBe('online')
  })

  it('does nothing while disconnected', async () => {
    const { storage } = await createStorage({ enabled: false })
    await storage.connect()

    writeText(localPath('categories.json'), '[]')
    storage.pushFile(localPath('categories.json'))
    await storage.flush()

    expect(provider.files.size).toBe(0)
  })

  it('turns a refused upload into a read-only budget', async () => {
    const { storage } = await createStorage()
    await storage.connect()
    provider.writeError = refusal('espace insuffisant', 507)

    writeText(localPath('categories.json'), '[]')
    storage.pushFile(localPath('categories.json'))
    await storage.flush()

    expect(storage.status).toMatchObject({ state: 'error', message: 'espace insuffisant' })
    expect(() => storage.assertWritable()).toThrow()
  })

  it('uploads in the order the writes happened', async () => {
    const { storage } = await createStorage()
    await storage.connect()
    const uploaded: string[] = []
    vi.spyOn(provider, 'write').mockImplementation((remotePath: string) => {
      uploaded.push(remotePath)
      return Promise.resolve()
    })

    writeText(localPath('categories.json'), '[]')
    writeText(localPath('thresholds.json'), '{}')
    storage.pushFile(localPath('categories.json'))
    storage.pushFile(localPath('thresholds.json'))
    await storage.flush()

    expect(uploaded).toEqual(['budget-app/categories.json', 'budget-app/thresholds.json'])
  })
})

describe('removeFile', () => {
  it('mirrors the deletion of a month', async () => {
    provider.files.set('budget-app/months/2026-09.json', '[]')
    const { storage } = await createStorage()
    await storage.connect()

    storage.removeFile(localPath('months', '2026-09.json'))
    await storage.flush()

    expect(provider.files.has('budget-app/months/2026-09.json')).toBe(false)
  })

  it('ignores a file that is not mirrored', async () => {
    const { storage } = await createStorage()
    await storage.connect()
    const remove = vi.spyOn(provider, 'remove')

    storage.removeFile(localPath('notes.json'))
    await storage.flush()

    expect(remove).not.toHaveBeenCalled()
  })

  it('goes offline when a deletion cannot be sent', async () => {
    provider.files.set('budget-app/months/2026-09.json', '[]')
    const { storage } = await createStorage()
    await storage.connect()
    provider.removeError = unreachable()

    storage.removeFile(localPath('months', '2026-09.json'))
    await storage.flush()

    expect(storage.status.state).toBe('offline')
  })
})

describe('disconnect', () => {
  it('goes back to local storage and switches the server off', async () => {
    const { storage, configs } = await createStorage()
    await storage.connect()

    storage.disconnect()

    expect(storage.status).toEqual({ state: 'disabled' })
    expect(configs.config.enabled).toBe(false)
    expect(configs.config.baseUrl).toBe(SERVER.baseUrl)
    expect(() => storage.assertWritable()).not.toThrow()
  })

  it('stops mirroring afterwards', async () => {
    const { storage } = await createStorage()
    await storage.connect()
    storage.disconnect()

    writeText(localPath('categories.json'), '[]')
    storage.pushFile(localPath('categories.json'))
    await storage.flush()

    expect(provider.files.size).toBe(0)
  })
})

describe('saveConfig', () => {
  it('records a new server without connecting to it', async () => {
    const { storage, configs } = await createStorage({ enabled: false })

    storage.saveConfig({ ...SERVER, remoteDir: 'ailleurs', enabled: true })

    expect(configs.config.remoteDir).toBe('ailleurs')
    expect(storage.status.state).toBe('disabled')
  })
})

describe('passwords', () => {
  it('delegates storing, checking and forgetting', async () => {
    const credentials = new CredentialStore({
      loadSecret: () => Promise.reject(new Error('none')),
      env: { BUDGET_APP_REMOTE_PASSWORD: 's3cret' },
    })
    const save = vi.spyOn(credentials, 'save').mockResolvedValue(true)
    const remove = vi.spyOn(credentials, 'remove').mockResolvedValue()

    const configs = new modules.configStore.RemoteConfigStore()
    const storage = new modules.storage.RemoteStorage({ configStore: configs, credentials, retryDelayMs: 0 })
    disposables.push(configs, storage)

    await expect(storage.savePassword(configs.config, 'nouveau')).resolves.toBe(true)
    await expect(storage.hasPassword(configs.config)).resolves.toBe(true)
    await storage.forgetPassword(configs.config)

    expect(save).toHaveBeenCalledWith(configs.config, 'nouveau')
    expect(remove).toHaveBeenCalledWith(configs.config)
  })
})

describe('retrying', () => {
  it('tries again after a server that did not answer', async () => {
    vi.useFakeTimers()
    provider.probeError = unreachable()
    const { storage } = await createStorage({ retryDelayMs: 1000 })

    await storage.connect()
    expect(storage.status.state).toBe('offline')

    provider.probeError = undefined
    provider.files.set('budget-app/categories.json', '[]')
    await vi.advanceTimersByTimeAsync(1000)

    expect(storage.status.state).toBe('online')
  })

  it('does not stack retries', async () => {
    vi.useFakeTimers()
    provider.probeError = unreachable()
    const { storage } = await createStorage({ retryDelayMs: 1000 })

    await storage.connect()
    await storage.connect()

    expect(vi.getTimerCount()).toBe(1)
  })

  it('never retries a refusal', async () => {
    vi.useFakeTimers()
    provider.probeError = refusal('identifiants refusés')
    const { storage } = await createStorage({ retryDelayMs: 1000 })

    await storage.connect()

    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('the default wiring', () => {
  it('talks WebDAV over the global fetch when no provider is injected', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('nope', { status: 401 })))
    vi.stubGlobal('fetch', fetchImpl)

    const configs = new modules.configStore.RemoteConfigStore()
    configs.save({ ...SERVER, enabled: true })
    const credentials = new CredentialStore({
      loadSecret: () => Promise.reject(new Error('no typelib')),
      env: { BUDGET_APP_REMOTE_PASSWORD: 's3cret' },
    })
    const storage = new modules.storage.RemoteStorage({ configStore: configs, credentials, retryDelayMs: 0 })
    disposables.push(configs, storage)

    await storage.connect()

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://cloud.example.org/dav',
      expect.objectContaining({
        method: 'PROPFIND',
        headers: expect.objectContaining({ Authorization: `Basic ${Buffer.from('alice:s3cret').toString('base64')}` }),
      }),
    )
    expect(storage.status).toMatchObject({ state: 'error' })
    expect(storage.status.message).toContain('Accès au serveur refusé')
  })
})

describe('dispose', () => {
  it('stops reporting and stops mirroring', async () => {
    const { storage } = await createStorage()
    await storage.connect()
    const listener = vi.fn()
    storage.onStatusChange(listener)

    storage.dispose()
    writeText(localPath('categories.json'), '[]')
    storage.pushFile(localPath('categories.json'))
    await storage.flush()

    expect(listener).not.toHaveBeenCalled()
    expect(provider.files.size).toBe(0)
  })

  it('drops a connection that lands after it', async () => {
    provider.files.set('budget-app/categories.json', '[]')
    const { storage } = await createStorage()

    const pending = storage.connect()
    storage.dispose()
    await pending

    expect(storage.status.state).not.toBe('online')
  })

  it('swallows a failure that lands after it', async () => {
    provider.probeError = unreachable()
    const { storage } = await createStorage()

    const pending = storage.connect()
    storage.dispose()
    await pending

    expect(storage.status.state).toBe('connecting')
  })
})
