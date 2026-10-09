/*
 * data/bank/redirect-listener.ts — receives the bank's return on this machine.
 *
 * A desktop application has no custom URL scheme to be woken up by, so the
 * redirect URL registered with Enable Banking points at a throwaway HTTP
 * listener on the loopback interface. It lives only for the duration of one
 * connection attempt, answers a single request, and never listens beyond
 * 127.0.0.1.
 */
import http from 'node:http'

const PAGE = `<!doctype html><meta charset="utf-8"><title>Budget</title>
<body style="font-family:sans-serif;text-align:center;margin-top:20vh">
<h2>Budget</h2><p>Connexion bancaire reçue — vous pouvez fermer cet onglet.<br>Bank connection received — you can close this tab.</p>`

/** How long the listener waits for the user to come back from the bank. */
export const REDIRECT_LISTENER_TIMEOUT_MS = 10 * 60 * 1000

export interface RedirectListener {
  close(): void
}

/** The loopback port and path a redirect URL asks for, or null when it cannot be served here. */
export function loopbackTarget(redirectUrl: string): { port: number; path: string } | null {
  let url: URL
  try {
    url = new URL(redirectUrl)
  } catch {
    return null
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'http:' || !loopback || url.port === '') return null
  return { port: Number(url.port), path: url.pathname }
}

/**
 * Starts listening for the return on the redirect URL. `onUrl` gets the full URL
 * the bank sent the browser to; the listener closes itself after that or on timeout.
 * Rejects when the address cannot be served (not a loopback URL, port taken).
 */
export function listenForBankRedirect(
  redirectUrl: string,
  onUrl: (url: string) => void,
  timeoutMs: number = REDIRECT_LISTENER_TIMEOUT_MS,
): Promise<RedirectListener> {
  const target = loopbackTarget(redirectUrl)
  if (target === null) return Promise.reject(new Error('not-loopback'))

  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined
    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? '/', `http://localhost:${target.port}`)
      if (url.pathname !== target.path) {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE, () => {
        close()
        onUrl(url.href)
      })
    })

    const close = (): void => {
      if (timer) clearTimeout(timer)
      server.close()
      server.closeAllConnections()
    }

    server.once('error', reject)
    server.listen(target.port, '127.0.0.1', () => {
      server.off('error', reject)
      timer = setTimeout(close, timeoutMs)
      timer.unref()
      resolve({ close })
    })
  })
}
