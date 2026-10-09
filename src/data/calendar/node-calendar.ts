import type { HttpTransport } from 'budget-lib'

/** HTTP failures remain responses; only transport failures reject. */
export const nodeCalendarTransport: HttpTransport = async ({ method, url, headers, body }) => {
  const response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(30_000) })
  const responseHeaders: Record<string, string> = {}
  response.headers.forEach((value, name) => { responseHeaders[name.toLowerCase()] = value })
  return { status: response.status, headers: responseHeaders, body: await response.text() }
}
