/*
 * Covers where the Enable Banking key comes from. libsecret is injected, so a
 * session with a working keyring and one without the typelib can both be
 * reproduced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BANK_KEY_ENV_VAR, BankKeyStore } from '../../../src/data/bank/bank-key-store.js'
import { clearStubbedKeyring } from '../../helpers/secret-stub.js'

function fakeSecret(overrides: Record<string, unknown> = {}) {
  return {
    Schema: { new: vi.fn(() => 'schema') },
    SchemaFlags: { NONE: 0 },
    SchemaAttributeType: { STRING: 0 },
    COLLECTION_DEFAULT: 'default',
    passwordLookupSync: vi.fn(() => 'PEM'),
    passwordStoreSync: vi.fn(() => true),
    passwordClearSync: vi.fn(() => true),
    ...overrides,
  }
}

const storeWith = (secret: unknown, env: NodeJS.ProcessEnv = {}) =>
  new BankKeyStore({ loadSecret: () => Promise.resolve(secret as never), env })

const storeWithoutSecret = (env: NodeJS.ProcessEnv = {}) =>
  new BankKeyStore({ loadSecret: () => Promise.reject(new Error('no typelib')), env })

beforeEach(clearStubbedKeyring)

describe('load', () => {
  it('reads the key from the keyring, filed under the application id', async () => {
    const secret = fakeSecret()

    await expect(storeWith(secret).load(' app ')).resolves.toBe('PEM')
    expect(secret.Schema.new).toHaveBeenCalledWith('org.gtk.budget-app.Bank', 0, { application: 0 })
    expect(secret.passwordLookupSync).toHaveBeenCalledWith('schema', { application: 'app' }, null)
  })

  it('falls back to the environment when the typelib is missing', async () => {
    await expect(storeWithoutSecret({ [BANK_KEY_ENV_VAR]: 'ENV-PEM' }).load('app')).resolves.toBe('ENV-PEM')
  })

  it('falls back to the environment when the keyring holds nothing or refuses', async () => {
    const empty = fakeSecret({ passwordLookupSync: vi.fn(() => null) })
    const locked = fakeSecret({ passwordLookupSync: vi.fn(() => { throw new Error('locked') }) })

    await expect(storeWith(empty, { [BANK_KEY_ENV_VAR]: 'ENV-PEM' }).load('app')).resolves.toBe('ENV-PEM')
    await expect(storeWith(locked, { [BANK_KEY_ENV_VAR]: 'ENV-PEM' }).load('app')).resolves.toBe('ENV-PEM')
  })

  it('answers an empty text when nothing knows the key', async () => {
    await expect(storeWithoutSecret().load('app')).resolves.toBe('')
  })

  it('works against the default loader', async () => {
    const store = new BankKeyStore({ env: {} })

    await store.save('app', 'PEM')

    await expect(store.load('app')).resolves.toBe('PEM')
  })
})

describe('save', () => {
  it('stores the key in the keyring', async () => {
    const secret = fakeSecret()

    await expect(storeWith(secret).save('app', 'PEM')).resolves.toBe(true)
    expect(secret.passwordStoreSync).toHaveBeenCalledWith(
      'schema',
      { application: 'app' },
      'default',
      expect.any(String),
      'PEM',
      null,
    )
  })

  it('reports false without a keyring, or when it refuses', async () => {
    const refusing = fakeSecret({ passwordStoreSync: vi.fn(() => { throw new Error('locked') }) })

    await expect(storeWithoutSecret().save('app', 'PEM')).resolves.toBe(false)
    await expect(storeWith(refusing).save('app', 'PEM')).resolves.toBe(false)
    await expect(storeWith(fakeSecret({ passwordStoreSync: undefined })).save('app', 'PEM')).resolves.toBe(false)
  })
})

describe('remove and has', () => {
  it('forgets the key', async () => {
    const secret = fakeSecret()

    await storeWith(secret).remove('app')

    expect(secret.passwordClearSync).toHaveBeenCalledWith('schema', { application: 'app' }, null)
  })

  it('stays silent when there is nothing to forget it from', async () => {
    const refusing = fakeSecret({ passwordClearSync: vi.fn(() => { throw new Error('locked') }) })

    await expect(storeWithoutSecret().remove('app')).resolves.toBeUndefined()
    await expect(storeWith(refusing).remove('app')).resolves.toBeUndefined()
    await expect(storeWith(fakeSecret({ passwordClearSync: undefined })).remove('app')).resolves.toBeUndefined()
  })

  it('tells whether a key is available', async () => {
    await expect(storeWith(fakeSecret()).has('app')).resolves.toBe(true)
    await expect(storeWithoutSecret().has('app')).resolves.toBe(false)
  })
})
