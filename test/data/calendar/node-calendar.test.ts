import { afterEach, describe, expect, it, vi } from 'vitest'
import { nodeCalendarTransport } from '../../../src/data/calendar/node-calendar.js'

afterEach(() => vi.restoreAllMocks())

describe('Node CalDAV transport', () => {
  it.each(['PROPFIND', 'REPORT', 'PUT', 'DELETE'])('sends %s and returns HTTP errors, lower-case headers and a text body', async (method) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('refused', { status: 401, headers: { ETag: '"v1"', 'X-CUSTOM': 'value' } }))
    const request = { method, url: 'https://dav.test/cal', headers: { Authorization: 'Basic test', Depth: '1' }, body: '<query/>' }
    const response = await nodeCalendarTransport(request)
    expect(response).toMatchObject({ status: 401, body: 'refused', headers: { etag: '"v1"', 'x-custom': 'value' } })
    expect(fetch).toHaveBeenCalledWith(request.url, expect.objectContaining({ method, headers: request.headers, body: request.body, signal: expect.any(AbortSignal) }))
  })
  it('rejects a network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Offline'))
    await expect(nodeCalendarTransport({ method: 'REPORT', url: 'https://dav.test/cal', headers: {} })).rejects.toThrow('Offline')
  })
})
