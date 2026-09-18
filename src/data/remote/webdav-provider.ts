/*
 * data/remote/webdav-provider.ts — the budget over WebDAV.
 *
 * WebDAV was picked as the first provider because it is the one protocol that
 * is not a single vendor: Nextcloud, ownCloud, Koofr, pCloud, box.com and
 * Yandex Disk all answer it, so one implementation opens several clouds.
 *
 * It is plain HTTP with four extra verbs, which keeps this file small: the
 * global `fetch` does the work, Basic authentication goes in a header, and
 * directory listings come back as XML.
 *
 * That XML is read with regular expressions rather than a parser, on purpose.
 * The vocabulary we need is two elements deep — `href` and `collection` — but
 * every server namespaces them differently (`d:`, `D:`, `lp1:`, none at all),
 * so a tolerant scan is both shorter and less brittle than pinning down a
 * schema. Anything unrecognised is simply not listed.
 */
import { remoteUrl } from '../../domain/remote.js'
import { RemoteRequestError, type RemoteEntry, type RemoteProvider } from './provider.js'

/** Long enough for a sleepy server, short enough to not freeze a save. */
const REQUEST_TIMEOUT_MS = 15_000

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>`

export interface WebDavProviderOptions {
  /** Root address, without trailing slash. */
  baseUrl: string
  username: string
  password: string
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
}

export class WebDavProvider implements RemoteProvider {
  readonly label = 'WebDAV'

  readonly #baseUrl: string
  readonly #authorization: string
  readonly #fetch: typeof fetch
  /** Directories already created this session — MKCOL is not worth repeating. */
  readonly #knownDirectories = new Set<string>()

  constructor({ baseUrl, username, password, fetchImpl }: WebDavProviderOptions) {
    this.#baseUrl = baseUrl
    this.#authorization = `Basic ${Buffer.from(`${username}:${password}`, 'utf-8').toString('base64')}`
    this.#fetch = fetchImpl ?? globalThis.fetch
  }

  async probe(): Promise<void> {
    const response = await this.#request('PROPFIND', '', {
      headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
      body: PROPFIND_BODY,
    })
    this.#assertOk(response, 'Accès au serveur refusé')
  }

  async list(remotePath: string): Promise<RemoteEntry[]> {
    const response = await this.#request('PROPFIND', remotePath, {
      headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
      body: PROPFIND_BODY,
    })

    // A directory that does not exist yet simply holds nothing.
    if (response.status === 404) return []
    this.#assertOk(response, 'Lecture du dossier distant impossible')

    return parseListing(await response.text(), pathnameOf(this.#url(remotePath)))
  }

  async read(remotePath: string): Promise<string | null> {
    const response = await this.#request('GET', remotePath)
    if (response.status === 404) return null
    this.#assertOk(response, 'Lecture du fichier distant impossible')
    return response.text()
  }

  async write(remotePath: string, contents: string): Promise<void> {
    await this.ensureDirectory(parentOf(remotePath))

    const response = await this.#request('PUT', remotePath, {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: contents,
    })
    this.#assertOk(response, 'Écriture sur le serveur impossible')
  }

  async remove(remotePath: string): Promise<void> {
    const response = await this.#request('DELETE', remotePath)
    // Already gone is exactly the state we wanted.
    if (response.status === 404) return
    this.#assertOk(response, 'Suppression sur le serveur impossible')
  }

  async ensureDirectory(remotePath: string): Promise<void> {
    if (remotePath === '' || this.#knownDirectories.has(remotePath)) return

    // Parents first: MKCOL refuses to create a directory under a missing one.
    await this.ensureDirectory(parentOf(remotePath))

    const response = await this.#request('MKCOL', remotePath)
    // 405 is the server saying it is already there, which is what we asked for.
    if (response.status !== 405) {
      this.#assertOk(response, 'Création du dossier distant impossible')
    }
    this.#knownDirectories.add(remotePath)
  }

  #url(remotePath: string): string {
    return remoteUrl(this.#baseUrl, remotePath)
  }

  #request(method: string, remotePath: string, init: RequestInit = {}): Promise<Response> {
    return this.#fetch(this.#url(remotePath), {
      ...init,
      method,
      headers: { ...init.headers, Authorization: this.#authorization },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  }

  #assertOk(response: Response, message: string): void {
    if (response.ok) return
    throw new RemoteRequestError(`${message} (${describeStatus(response.status)})`, response.status)
  }
}

/** Element matcher tolerating any namespace prefix, or none. */
function tagPattern(name: string, flags: string): RegExp {
  return new RegExp(`<(?:[A-Za-z0-9._-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9._-]+:)?${name}>`, flags)
}

const RESPONSE_PATTERN = tagPattern('response', 'gi')
const HREF_PATTERN = tagPattern('href', 'i')
const COLLECTION_PATTERN = /<(?:[A-Za-z0-9._-]+:)?collection(?:\s[^>]*)?\/?>/i

/**
 * Turns a `multistatus` body into entries, dropping the directory's own row:
 * a listing describes itself first, and that is not one of its children.
 */
export function parseListing(xml: string, selfPathname: string): RemoteEntry[] {
  const entries: RemoteEntry[] = []
  const self = withoutTrailingSlash(selfPathname)

  for (const [, block] of xml.matchAll(RESPONSE_PATTERN)) {
    const href = HREF_PATTERN.exec(block)?.[1]?.trim()
    if (!href) continue

    const pathname = withoutTrailingSlash(decodePathname(hrefPathname(href)))
    if (pathname === self || pathname === '') continue

    const name = pathname.slice(pathname.lastIndexOf('/') + 1)
    if (name !== '') entries.push({ name, isDirectory: COLLECTION_PATTERN.test(block) })
  }

  return entries
}

/** An href may be absolute or a full URL; only its path is comparable. */
function hrefPathname(href: string): string {
  try {
    return new URL(href, 'http://placeholder.invalid').pathname
  } catch {
    return href
  }
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

function decodePathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname // stray "%" — compare it as it came
  }
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function parentOf(remotePath: string): string {
  const lastSlash = remotePath.lastIndexOf('/')
  return lastSlash === -1 ? '' : remotePath.slice(0, lastSlash)
}

function describeStatus(status: number): string {
  switch (status) {
    case 401:
      return 'identifiants refusés'
    case 403:
      return 'accès interdit'
    case 404:
      return 'introuvable'
    case 507:
      return 'espace insuffisant'
    default:
      return `erreur ${status}`
  }
}
