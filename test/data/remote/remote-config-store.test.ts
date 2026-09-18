/*
 * Covers `remote.json`: what it accepts from disk, how it canonicalises what
 * it is given, and the two properties that make it different from every other
 * store — it never holds the password, and it stays writable when the server
 * is unreachable, otherwise a bad address could not be corrected.
 */
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createTempUserDataDir,
  readJson,
  removeTempUserDataDir,
  writeJson,
  type TempDataDir,
} from '../../helpers/temp-data-dir.js'

type ConfigStoreModule = typeof import('../../../src/data/remote/remote-config-store.js')
type GatewayModule = typeof import('../../../src/data/remote/gateway.js')

let temp: TempDataDir
let configFile: string

async function loadModules(): Promise<{ stores: ConfigStoreModule; gateway: GatewayModule }> {
  return {
    stores: await import('../../../src/data/remote/remote-config-store.js'),
    gateway: await import('../../../src/data/remote/gateway.js'),
  }
}

beforeEach(() => {
  temp = createTempUserDataDir()
  configFile = path.join(temp.dataDir, 'remote.json')
})

afterEach(() => {
  removeTempUserDataDir(temp)
  vi.restoreAllMocks()
})

describe('loading', () => {
  it('starts disabled when there is no file', async () => {
    const { stores } = await loadModules()
    const store = new stores.RemoteConfigStore()

    expect(store.config).toEqual({
      provider: 'webdav',
      baseUrl: '',
      username: '',
      remoteDir: 'budget-app',
      enabled: false,
    })
    store.dispose()
  })

  it('reads a stored configuration', async () => {
    writeJson(configFile, {
      provider: 'webdav',
      baseUrl: 'https://cloud.example.org/dav',
      username: 'alice',
      remoteDir: 'budget',
      enabled: true,
    })

    const { stores } = await loadModules()
    const store = new stores.RemoteConfigStore()

    expect(store.config.baseUrl).toBe('https://cloud.example.org/dav')
    expect(store.config.enabled).toBe(true)
    store.dispose()
  })

  it('canonicalises what it read', async () => {
    writeJson(configFile, {
      provider: 'webdav',
      baseUrl: 'https://cloud.example.org/dav/',
      username: ' alice ',
      remoteDir: '/budget/',
      enabled: true,
    })

    const { stores } = await loadModules()
    const store = new stores.RemoteConfigStore()

    expect(store.config).toMatchObject({
      baseUrl: 'https://cloud.example.org/dav',
      username: 'alice',
      remoteDir: 'budget',
    })
    store.dispose()
  })

  it('falls back to the default when the file makes no sense', async () => {
    writeJson(configFile, { provider: 'ftp', baseUrl: 42 })

    const { stores } = await loadModules()
    const store = new stores.RemoteConfigStore()

    expect(store.config.enabled).toBe(false)
    expect(store.config.provider).toBe('webdav')
    store.dispose()
  })
})

describe('saving', () => {
  it('writes the canonicalised configuration to disk', async () => {
    const { stores } = await loadModules()
    const store = new stores.RemoteConfigStore()

    store.save({
      provider: 'webdav',
      baseUrl: 'https://cloud.example.org/dav/',
      username: 'alice',
      remoteDir: '//budget//2026//',
      enabled: true,
    })

    expect(readJson(configFile)).toEqual({
      provider: 'webdav',
      baseUrl: 'https://cloud.example.org/dav',
      username: 'alice',
      remoteDir: 'budget/2026',
      enabled: true,
    })
    store.dispose()
  })

  it('never writes a password, whatever it is handed', async () => {
    const { stores } = await loadModules()
    const store = new stores.RemoteConfigStore()

    store.save({
      provider: 'webdav',
      baseUrl: 'https://cloud.example.org/dav',
      username: 'alice',
      remoteDir: 'budget',
      enabled: true,
      // Simulates a caller passing more than the contract allows.
      password: 's3cret',
    } as never)

    expect(JSON.stringify(readJson(configFile))).not.toContain('s3cret')
    store.dispose()
  })

  it('notifies subscribers', async () => {
    const { stores } = await loadModules()
    const store = new stores.RemoteConfigStore()
    const listener = vi.fn()
    store.onChange(listener)

    store.save({ ...store.config, baseUrl: 'https://cloud.example.org/dav', username: 'alice', enabled: true })

    expect(listener).toHaveBeenCalledOnce()
    store.dispose()
  })
})

describe('disable', () => {
  it('switches the server off but keeps the address', async () => {
    const { stores } = await loadModules()
    const store = new stores.RemoteConfigStore()
    store.save({
      provider: 'webdav',
      baseUrl: 'https://cloud.example.org/dav',
      username: 'alice',
      remoteDir: 'budget',
      enabled: true,
    })

    store.disable()

    expect(store.config).toMatchObject({ enabled: false, baseUrl: 'https://cloud.example.org/dav' })
    store.dispose()
  })

  it('does nothing when it is already off', async () => {
    const { stores } = await loadModules()
    const store = new stores.RemoteConfigStore()
    const listener = vi.fn()
    store.onChange(listener)

    store.disable()

    expect(listener).not.toHaveBeenCalled()
    store.dispose()
  })
})

describe('offline behaviour', () => {
  it('stays writable while every other store is refused', async () => {
    const { stores, gateway } = await loadModules()
    gateway.setRemoteGateway({
      assertWritable: () => {
        throw new gateway.RemoteReadOnlyError()
      },
      pushFile: vi.fn(),
      removeFile: vi.fn(),
    })

    const store = new stores.RemoteConfigStore()
    expect(() => store.save({ ...store.config, remoteDir: 'ailleurs' })).not.toThrow()
    expect(store.config.remoteDir).toBe('ailleurs')

    store.dispose()
    gateway.setRemoteGateway(null)
  })

  it('is never mirrored to the server', async () => {
    const { stores, gateway } = await loadModules()
    const pushFile = vi.fn()
    gateway.setRemoteGateway({ assertWritable: vi.fn(), pushFile, removeFile: vi.fn() })

    const store = new stores.RemoteConfigStore()
    store.save({ ...store.config, remoteDir: 'ailleurs' })

    expect(pushFile).not.toHaveBeenCalled()
    store.dispose()
    gateway.setRemoteGateway(null)
  })
})
