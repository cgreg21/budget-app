/*
 * Exercises the WebDAV provider against a stubbed `fetch`: the verbs it
 * sends, the statuses it forgives (404 on read, 405 on MKCOL) and the
 * tolerant reading of `multistatus` bodies, whose namespace prefixes differ
 * from one server to the next.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RemoteRequestError } from '../../../src/data/remote/provider.js'
import { parseListing, WebDavProvider } from '../../../src/data/remote/webdav-provider.js'

const BASE_URL = 'https://cloud.example.org/dav'
const DAV_ROOT = '/dav/budget-app/months'

function multistatus(entries: { href: string; collection?: boolean }[]): string {
  const responses = entries.map(({ href, collection }) => `
    <d:response>
      <d:href>${href}</d:href>
      <d:propstat>
        <d:prop><d:resourcetype>${collection ? '<d:collection/>' : ''}</d:resourcetype></d:prop>
        <d:status>HTTP/1.1 200 OK</d:status>
      </d:propstat>
    </d:response>`).join('')

  return `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${responses}</d:multistatus>`
}

let fetchImpl: ReturnType<typeof vi.fn>

function provider(baseUrl = BASE_URL): WebDavProvider {
  return new WebDavProvider({ baseUrl, username: 'alice', password: 's3cret', fetchImpl: fetchImpl as never })
}

/** The arguments of the nth call, unpacked. */
function callAt(index: number): { method: string; url: string; headers: Record<string, string>; body?: string } {
  const [url, init] = fetchImpl.mock.calls[index] as [string, RequestInit]
  return {
    url,
    method: init.method as string,
    headers: init.headers as Record<string, string>,
    body: init.body as string | undefined,
  }
}

function methodsSent(): string[] {
  return fetchImpl.mock.calls.map((_call, index) => callAt(index).method)
}

beforeEach(() => {
  fetchImpl = vi.fn()
})

describe('authentication', () => {
  it('sends Basic credentials on every request', async () => {
    fetchImpl.mockResolvedValue(new Response('', { status: 207 }))
    await provider().probe()

    expect(callAt(0).headers.Authorization)
      .toBe(`Basic ${Buffer.from('alice:s3cret', 'utf-8').toString('base64')}`)
  })

  it('names itself for the interface', () => {
    expect(provider().label).toBe('WebDAV')
  })
})

describe('probe', () => {
  it('asks the root for its own properties', async () => {
    fetchImpl.mockResolvedValue(new Response('', { status: 207 }))
    await provider().probe()

    const { method, url, headers, body } = callAt(0)
    expect(method).toBe('PROPFIND')
    expect(url).toBe(BASE_URL)
    expect(headers.Depth).toBe('0')
    expect(body).toContain('<propfind')
  })

  it('reports refused credentials in French', async () => {
    fetchImpl.mockResolvedValue(new Response('', { status: 401 }))

    await expect(provider().probe()).rejects.toThrow(RemoteRequestError)
    await expect(provider().probe()).rejects.toThrow('identifiants refusés')
  })

  it.each([
    [403, 'accès interdit'],
    [404, 'introuvable'],
    [507, 'espace insuffisant'],
    [500, 'erreur 500'],
  ])('describes status %i as %j', async (status, expected) => {
    fetchImpl.mockResolvedValue(new Response('', { status }))
    await expect(provider().probe()).rejects.toThrow(expected)
  })

  it('carries the status on the error', async () => {
    fetchImpl.mockResolvedValue(new Response('', { status: 403 }))
    await expect(provider().probe()).rejects.toMatchObject({ status: 403, name: 'RemoteRequestError' })
  })
})

describe('list', () => {
  it('returns the children, leaving the directory itself out', async () => {
    fetchImpl.mockResolvedValue(new Response(multistatus([
      { href: `${DAV_ROOT}/`, collection: true },
      { href: `${DAV_ROOT}/2026-09.json` },
      { href: `${DAV_ROOT}/archive/`, collection: true },
    ]), { status: 207 }))

    await expect(provider().list('budget-app/months')).resolves.toEqual([
      { name: '2026-09.json', isDirectory: false },
      { name: 'archive', isDirectory: true },
    ])
    expect(callAt(0).headers.Depth).toBe('1')
  })

  it('treats a missing directory as an empty one', async () => {
    fetchImpl.mockResolvedValue(new Response('', { status: 404 }))
    await expect(provider().list('budget-app/months')).resolves.toEqual([])
  })

  it('reports any other refusal', async () => {
    fetchImpl.mockResolvedValue(new Response('', { status: 403 }))
    await expect(provider().list('budget-app/months')).rejects.toThrow('Lecture du dossier distant impossible')
  })

  it('still lists when the base address is not a full URL', async () => {
    fetchImpl.mockResolvedValue(new Response(multistatus([
      { href: 'budget-app/months/2026-09.json' },
    ]), { status: 207 }))

    await expect(provider('').list('budget-app/months')).resolves.toEqual([
      { name: '2026-09.json', isDirectory: false },
    ])
  })
})

describe('read', () => {
  it('returns the file contents', async () => {
    fetchImpl.mockResolvedValue(new Response('{"a":1}', { status: 200 }))

    await expect(provider().read('budget-app/categories.json')).resolves.toBe('{"a":1}')
    expect(callAt(0)).toMatchObject({ method: 'GET', url: `${BASE_URL}/budget-app/categories.json` })
  })

  it('returns null for a file that is not there', async () => {
    fetchImpl.mockResolvedValue(new Response('', { status: 404 }))
    await expect(provider().read('budget-app/categories.json')).resolves.toBeNull()
  })

  it('reports a refusal', async () => {
    fetchImpl.mockResolvedValue(new Response('', { status: 401 }))
    await expect(provider().read('budget-app/categories.json')).rejects.toThrow('Lecture du fichier distant impossible')
  })
})

describe('write', () => {
  it('creates the parent directories before uploading', async () => {
    fetchImpl.mockResolvedValue(new Response('', { status: 201 }))
    await provider().write('budget-app/months/2026-09.json', '[]')

    expect(methodsSent()).toEqual(['MKCOL', 'MKCOL', 'PUT'])
    expect(callAt(0).url).toBe(`${BASE_URL}/budget-app`)
    expect(callAt(1).url).toBe(`${BASE_URL}/budget-app/months`)
    expect(callAt(2)).toMatchObject({
      url: `${BASE_URL}/budget-app/months/2026-09.json`,
      body: '[]',
    })
  })

  it('does not create the same directory twice', async () => {
    fetchImpl.mockResolvedValue(new Response('', { status: 201 }))
    const dav = provider()

    await dav.write('budget-app/months/2026-09.json', '[]')
    await dav.write('budget-app/months/2026-10.json', '[]')

    expect(methodsSent()).toEqual(['MKCOL', 'MKCOL', 'PUT', 'PUT'])
  })

  it('reports a refused upload', async () => {
    fetchImpl.mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve(new Response('', { status: init.method === 'PUT' ? 507 : 201 })))

    await expect(provider().write('budget-app/categories.json', '[]'))
      .rejects.toThrow('Écriture sur le serveur impossible (espace insuffisant)')
  })
})

describe('remove', () => {
  it('deletes the file', async () => {
    fetchImpl.mockResolvedValue(new Response(null, { status: 204 }))
    await provider().remove('budget-app/months/2026-09.json')

    expect(callAt(0)).toMatchObject({ method: 'DELETE', url: `${BASE_URL}/budget-app/months/2026-09.json` })
  })

  it('accepts a file that was already gone', async () => {
    fetchImpl.mockResolvedValue(new Response('', { status: 404 }))
    await expect(provider().remove('budget-app/months/2026-09.json')).resolves.toBeUndefined()
  })

  it('reports a refusal', async () => {
    fetchImpl.mockResolvedValue(new Response('', { status: 403 }))
    await expect(provider().remove('budget-app/months/2026-09.json'))
      .rejects.toThrow('Suppression sur le serveur impossible')
  })
})

describe('ensureDirectory', () => {
  it('does nothing for the root', async () => {
    await provider().ensureDirectory('')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('accepts a directory the server already has', async () => {
    fetchImpl.mockResolvedValue(new Response('', { status: 405 }))
    await expect(provider().ensureDirectory('budget-app')).resolves.toBeUndefined()
  })

  it('reports a refusal', async () => {
    fetchImpl.mockResolvedValue(new Response('', { status: 403 }))
    await expect(provider().ensureDirectory('budget-app'))
      .rejects.toThrow('Création du dossier distant impossible')
  })

  it('remembers what it created', async () => {
    fetchImpl.mockResolvedValue(new Response('', { status: 201 }))
    const dav = provider()

    await dav.ensureDirectory('budget-app')
    await dav.ensureDirectory('budget-app')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('parseListing', () => {
  it('accepts any namespace prefix, or none', () => {
    const xml = `<multistatus>
      <D:response><D:href>/dav/a.json</D:href><D:prop/></D:response>
      <lp1:response><lp1:href>/dav/b.json</lp1:href></lp1:response>
      <response><href>/dav/c.json</href></response>
    </multistatus>`

    expect(parseListing(xml, '/dav').map((entry) => entry.name)).toEqual(['a.json', 'b.json', 'c.json'])
  })

  it('decodes percent-encoded names', () => {
    const xml = multistatus([{ href: '/dav/mon%20budget.json' }])
    expect(parseListing(xml, '/dav')).toEqual([{ name: 'mon budget.json', isDirectory: false }])
  })

  it('compares a full-URL href by its path', () => {
    const xml = multistatus([
      { href: 'https://cloud.example.org/dav/', collection: true },
      { href: 'https://cloud.example.org/dav/a.json' },
    ])
    expect(parseListing(xml, '/dav')).toEqual([{ name: 'a.json', isDirectory: false }])
  })

  it('keeps a name it cannot percent-decode', () => {
    const xml = multistatus([{ href: '/dav/100%.json' }])
    expect(parseListing(xml, '/dav')).toEqual([{ name: '100%.json', isDirectory: false }])
  })

  it('keeps an href it cannot read as a URL', () => {
    const xml = multistatus([{ href: 'http://[bad/x.json' }])
    expect(parseListing(xml, '/dav')).toEqual([{ name: 'x.json', isDirectory: false }])
  })

  it('skips a response with no href', () => {
    expect(parseListing('<multistatus><response><prop/></response></multistatus>', '/dav')).toEqual([])
  })

  it('skips an empty href', () => {
    expect(parseListing(multistatus([{ href: '   ' }]), '/dav')).toEqual([])
  })

  it('skips the root itself', () => {
    expect(parseListing(multistatus([{ href: '/' }]), '/dav')).toEqual([])
  })

  it('returns nothing for a body it does not recognise', () => {
    expect(parseListing('not xml at all', '/dav')).toEqual([])
  })
})
