/*
 * Covers where the password comes from. libsecret is injected rather than
 * imported, so the two situations that matter can both be reproduced: a
 * session with a working keyring, and one where the typelib is simply not
 * there — which is the normal case outside a GNOME desktop.
 */
import { describe, expect, it, vi } from 'vitest'

import { CredentialStore, PASSWORD_ENV_VARS } from '../../../src/data/remote/credentials.js'
import type { RemoteConfig } from '../../../src/domain/remote.js'
import { clearStubbedKeyring } from '../../helpers/secret-stub.js'

const config: RemoteConfig = {
  provider: 'webdav',
  baseUrl: 'https://cloud.example.org/dav/',
  username: ' alice ',
  remoteDir: 'budget-app',
  enabled: true,
}

/** The attributes the keyring entry is filed under, once canonicalised. */
const ATTRIBUTES = { server: 'https://cloud.example.org/dav', username: 'alice' }

function fakeSecret(overrides: Record<string, unknown> = {}) {
  return {
    Schema: { new: vi.fn(() => 'schema') },
    SchemaFlags: { NONE: 0 },
    SchemaAttributeType: { STRING: 0 },
    COLLECTION_DEFAULT: 'default',
    passwordLookupSync: vi.fn(() => 's3cret'),
    passwordStoreSync: vi.fn(() => true),
    passwordClearSync: vi.fn(() => true),
    ...overrides,
  }
}

function storeWith(secret: unknown, env: NodeJS.ProcessEnv = {}): CredentialStore {
  return new CredentialStore({ loadSecret: () => Promise.resolve(secret as never), env })
}

/** A session with no libsecret at all. */
function storeWithoutSecret(env: NodeJS.ProcessEnv = {}): CredentialStore {
  return new CredentialStore({ loadSecret: () => Promise.reject(new Error('no typelib')), env })
}

describe('load', () => {
  it('reads the password from the keyring', async () => {
    const secret = fakeSecret()

    await expect(storeWith(secret).load(config)).resolves.toEqual({ password: 's3cret', backend: 'keyring' })
    expect(secret.passwordLookupSync).toHaveBeenCalledWith('schema', ATTRIBUTES, null)
  })

  it('files the entry under a stable schema', async () => {
    const secret = fakeSecret()
    await storeWith(secret).load(config)

    expect(secret.Schema.new).toHaveBeenCalledWith('org.gtk.budget-app.Remote', 0, {
      server: 0,
      username: 0,
    })
  })

  it('falls back to the environment when the typelib is missing', async () => {
    const store = storeWithoutSecret({ BUDGET_APP_REMOTE_PASSWORD: 'from-env' })
    await expect(store.load(config)).resolves.toEqual({ password: 'from-env', backend: 'environment' })
  })

  it('falls back when the keyring holds nothing for this account', async () => {
    const secret = fakeSecret({ passwordLookupSync: vi.fn(() => null) })
    const store = storeWith(secret, { BUDGET_APP_WEBDAV_PASSWORD: 'from-env' })

    await expect(store.load(config)).resolves.toEqual({ password: 'from-env', backend: 'environment' })
  })

  it('falls back when the keyring refuses to answer', async () => {
    const secret = fakeSecret({
      passwordLookupSync: vi.fn(() => {
        throw new Error('locked')
      }),
    })
    const store = storeWith(secret, { BUDGET_APP_REMOTE_PASSWORD: 'from-env' })

    await expect(store.load(config)).resolves.toEqual({ password: 'from-env', backend: 'environment' })
  })

  it('falls back when libsecret is too old to know the function', async () => {
    const store = storeWith(fakeSecret({ passwordLookupSync: undefined }), {
      BUDGET_APP_REMOTE_PASSWORD: 'from-env',
    })
    await expect(store.load(config)).resolves.toEqual({ password: 'from-env', backend: 'environment' })
  })

  it('prefers the first environment variable', async () => {
    const store = storeWithoutSecret({
      BUDGET_APP_REMOTE_PASSWORD: 'first',
      BUDGET_APP_WEBDAV_PASSWORD: 'second',
    })
    await expect(store.load(config)).resolves.toMatchObject({ password: 'first' })
  })

  it('ignores an empty environment variable', async () => {
    const store = storeWithoutSecret({
      BUDGET_APP_REMOTE_PASSWORD: '',
      BUDGET_APP_WEBDAV_PASSWORD: 'second',
    })
    await expect(store.load(config)).resolves.toMatchObject({ password: 'second' })
  })

  it('reports having nothing rather than guessing', async () => {
    await expect(storeWithoutSecret().load(config)).resolves.toEqual({ password: '', backend: 'none' })
  })

  it('loads libsecret once, however many lookups happen', async () => {
    const loadSecret = vi.fn(() => Promise.resolve(fakeSecret() as never))
    const store = new CredentialStore({ loadSecret, env: {} })

    await store.load(config)
    await store.load(config)

    expect(loadSecret).toHaveBeenCalledTimes(1)
  })

  it('looks at both documented variables', () => {
    expect(PASSWORD_ENV_VARS).toEqual(['BUDGET_APP_REMOTE_PASSWORD', 'BUDGET_APP_WEBDAV_PASSWORD'])
  })
})

describe('save', () => {
  it('hands the password to the keyring', async () => {
    const secret = fakeSecret()

    await expect(storeWith(secret).save(config, 's3cret')).resolves.toBe(true)
    expect(secret.passwordStoreSync).toHaveBeenCalledWith(
      'schema',
      ATTRIBUTES,
      'default',
      'Budget — stockage distant',
      's3cret',
      null,
    )
  })

  it('reports that there is no keyring to save to', async () => {
    await expect(storeWithoutSecret().save(config, 's3cret')).resolves.toBe(false)
  })

  it('reports a keyring that refused', async () => {
    const secret = fakeSecret({
      passwordStoreSync: vi.fn(() => {
        throw new Error('locked')
      }),
    })
    await expect(storeWith(secret).save(config, 's3cret')).resolves.toBe(false)
  })

  it('reports a libsecret too old to know the function', async () => {
    const store = storeWith(fakeSecret({ passwordStoreSync: undefined }))
    await expect(store.save(config, 's3cret')).resolves.toBe(false)
  })
})

describe('remove', () => {
  it('clears the entry', async () => {
    const secret = fakeSecret()
    await storeWith(secret).remove(config)

    expect(secret.passwordClearSync).toHaveBeenCalledWith('schema', ATTRIBUTES, null)
  })

  it('stays silent when there is no keyring', async () => {
    await expect(storeWithoutSecret().remove(config)).resolves.toBeUndefined()
  })

  it('stays silent when the keyring refuses', async () => {
    const secret = fakeSecret({
      passwordClearSync: vi.fn(() => {
        throw new Error('locked')
      }),
    })
    await expect(storeWith(secret).remove(config)).resolves.toBeUndefined()
  })

  it('stays silent when libsecret is too old to know the function', async () => {
    await expect(storeWith(fakeSecret({ passwordClearSync: undefined })).remove(config)).resolves.toBeUndefined()
  })
})

describe('has', () => {
  it('answers without revealing the password', async () => {
    await expect(storeWith(fakeSecret()).has(config)).resolves.toBe(true)
    await expect(storeWithoutSecret().has(config)).resolves.toBe(false)
  })
})

describe('defaults', () => {
  it('reads the real environment when none is given', async () => {
    const store = new CredentialStore({ loadSecret: () => Promise.reject(new Error('none')) })
    vi.stubEnv('BUDGET_APP_REMOTE_PASSWORD', 'from-process-env')

    await expect(store.load(config)).resolves.toMatchObject({ password: 'from-process-env' })
    vi.unstubAllEnvs()
  })

  it('goes to libsecret when none is given', async () => {
    clearStubbedKeyring()
    const store = new CredentialStore()

    await expect(store.save(config, 'from-keyring')).resolves.toBe(true)
    await expect(store.load(config)).resolves.toEqual({ password: 'from-keyring', backend: 'keyring' })

    await store.remove(config)
    await expect(store.has(config)).resolves.toBe(false)
  })
})
