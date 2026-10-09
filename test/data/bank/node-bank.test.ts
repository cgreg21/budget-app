/*
 * Covers the platform side of the bank client: the RS256 signature is checked
 * with the public key (the proof it is a real JWT), and the transport against
 * a stubbed `fetch`.
 */
import { generateKeyPairSync, verify } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { nodeBankHttp, rsaSigner } from '../../../src/data/bank/node-bank.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('rsaSigner', () => {
  it('produces a JWT whose signature verifies with the public key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

    const token = rsaSigner({ typ: 'JWT', alg: 'RS256', kid: 'app' }, { iss: 'x', iat: 1 }, pem)

    const [header, payload, signature] = token.split('.') as [string, string, string]
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ typ: 'JWT', alg: 'RS256', kid: 'app' })
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({ iss: 'x', iat: 1 })
    expect(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url'))).toBe(true)
  })
})

describe('nodeBankHttp', () => {
  it('sends the request and resolves with the status and body, whatever the status', async () => {
    const fetchMock = vi.fn(async () => new Response('{"message":"no"}', { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    const answer = await nodeBankHttp({
      method: 'POST',
      url: 'https://api.example/auth',
      headers: { Accept: 'application/json' },
      body: '{"a":1}',
      timeoutMs: 1000,
    })

    expect(answer).toEqual({ status: 403, body: '{"message":"no"}' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/auth',
      expect.objectContaining({ method: 'POST', headers: { Accept: 'application/json' }, body: '{"a":1}' }),
    )
  })

  it('sends no body for a GET', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    await nodeBankHttp({ method: 'GET', url: 'https://api.example/x', headers: {}, timeoutMs: 1000 })

    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('body')
  })

  it('rejects when nothing answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))

    await expect(nodeBankHttp({ method: 'GET', url: 'https://x', headers: {}, timeoutMs: 1000 })).rejects.toThrow('fetch failed')
  })
})
