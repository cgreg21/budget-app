/*
 * Covers the registry the stores go through, including the case that matters
 * most: with no gateway installed the application is purely local and nothing
 * is ever refused.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  assertRemoteWritable,
  getRemoteGateway,
  pushToRemote,
  RemoteReadOnlyError,
  removeFromRemote,
  setRemoteGateway,
  type RemoteGateway,
} from '../../../src/data/remote/gateway.js'

function fakeGateway(overrides: Partial<RemoteGateway> = {}): RemoteGateway {
  return {
    assertWritable: vi.fn(),
    pushFile: vi.fn(),
    removeFile: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  setRemoteGateway(null)
})

afterEach(() => {
  setRemoteGateway(null)
})

describe('with no gateway', () => {
  it('starts out empty', () => {
    expect(getRemoteGateway()).toBeNull()
  })

  it('allows every write', () => {
    expect(() => assertRemoteWritable()).not.toThrow()
  })

  it('ignores the mirroring calls', () => {
    expect(() => pushToRemote('/tmp/x.json')).not.toThrow()
    expect(() => removeFromRemote('/tmp/x.json')).not.toThrow()
  })
})

describe('with a gateway installed', () => {
  it('routes the questions and the transfers to it', () => {
    const gateway = fakeGateway()
    setRemoteGateway(gateway)

    assertRemoteWritable()
    pushToRemote('/tmp/x.json')
    removeFromRemote('/tmp/y.json')

    expect(getRemoteGateway()).toBe(gateway)
    expect(gateway.assertWritable).toHaveBeenCalledOnce()
    expect(gateway.pushFile).toHaveBeenCalledWith('/tmp/x.json')
    expect(gateway.removeFile).toHaveBeenCalledWith('/tmp/y.json')
  })

  it('lets its refusal through', () => {
    setRemoteGateway(fakeGateway({
      assertWritable: () => {
        throw new RemoteReadOnlyError()
      },
    }))

    expect(() => assertRemoteWritable()).toThrow(RemoteReadOnlyError)
  })

  it('can be uninstalled, going back to local storage', () => {
    setRemoteGateway(fakeGateway({
      assertWritable: () => {
        throw new RemoteReadOnlyError()
      },
    }))
    setRemoteGateway(null)

    expect(() => assertRemoteWritable()).not.toThrow()
  })
})

describe('RemoteReadOnlyError', () => {
  it('carries a message meant for the user', () => {
    expect(new RemoteReadOnlyError().message).toBe('Hors ligne — le budget est en lecture seule')
  })

  it('accepts a more precise one', () => {
    const error = new RemoteReadOnlyError('Serveur inaccessible')
    expect(error.message).toBe('Serveur inaccessible')
    expect(error.name).toBe('RemoteReadOnlyError')
    expect(error).toBeInstanceOf(Error)
  })
})
