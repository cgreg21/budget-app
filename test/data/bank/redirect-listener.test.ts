/*
 * Covers the one-shot listener that catches the bank's return on localhost,
 * against a real server on a free port.
 */
import http from 'node:http'
import net from 'node:net'
import { describe, expect, it } from 'vitest'

import { listenForBankRedirect, loopbackTarget } from '../../../src/data/bank/redirect-listener.js'

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo
      server.close(() => resolve(port))
    })
  })
}

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path, agent: false }, (response) => {
      let body = ''
      response.on('data', (chunk) => (body += chunk))
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }))
    }).on('error', reject)
  })
}

describe('loopbackTarget', () => {
  it('accepts http on localhost or 127.0.0.1 with a port', () => {
    expect(loopbackTarget('http://localhost:8765/bank')).toEqual({ port: 8765, path: '/bank' })
    expect(loopbackTarget('http://127.0.0.1:9000/x')).toEqual({ port: 9000, path: '/x' })
  })

  it('refuses everything else', () => {
    expect(loopbackTarget('budgetmobile://bank')).toBeNull()
    expect(loopbackTarget('https://localhost:8765/bank')).toBeNull()
    expect(loopbackTarget('http://example.org:8765/bank')).toBeNull()
    expect(loopbackTarget('http://localhost/bank')).toBeNull()
    expect(loopbackTarget('not a url')).toBeNull()
  })
})

describe('listenForBankRedirect', () => {
  it('hands the full return URL over, answers the browser and closes', async () => {
    const port = await freePort()
    const received = new Promise<string>((resolve) => {
      void listenForBankRedirect(`http://localhost:${port}/bank`, resolve)
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const answer = await get(port, '/bank?code=abc&state=xyz')

    expect(answer.status).toBe(200)
    expect(answer.body).toContain('Budget')
    await expect(received).resolves.toBe(`http://localhost:${port}/bank?code=abc&state=xyz`)
    await expect(get(port, '/bank')).rejects.toThrow()
  })

  it('ignores other paths and keeps waiting', async () => {
    const port = await freePort()
    const urls: string[] = []
    const listener = await listenForBankRedirect(`http://localhost:${port}/bank`, (url) => urls.push(url))

    expect((await get(port, '/favicon.ico')).status).toBe(404)
    expect(urls).toEqual([])
    listener.close()
  })

  it('rejects an address it cannot serve, or a port already taken', async () => {
    await expect(listenForBankRedirect('budgetmobile://bank', () => {})).rejects.toThrow('not-loopback')

    const port = await freePort()
    const first = await listenForBankRedirect(`http://localhost:${port}/bank`, () => {})
    await expect(listenForBankRedirect(`http://localhost:${port}/bank`, () => {})).rejects.toThrow()
    first.close()
  })

  it('gives up after the timeout', async () => {
    const port = await freePort()
    await listenForBankRedirect(`http://localhost:${port}/bank`, () => {}, 20)

    await new Promise((resolve) => setTimeout(resolve, 100))

    await expect(get(port, '/bank')).rejects.toThrow()
  })
})
