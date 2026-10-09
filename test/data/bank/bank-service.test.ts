/*
 * Covers the desktop orchestration of the bank import: credentials, the
 * authorisation round trip (listener or pasted address), the import itself and
 * its bookkeeping, the automatic import, and how every failure is reported.
 * The bank is a scripted transport; the protocol itself is tested in budget-lib.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultBankState, type Aspsp, type BankHttp, type BankState, type Category, type Transaction } from 'budget-lib'
import {
  BANK_AUTO_IMPORT_CHECK_MS,
  BankService,
  type BankNotice,
  type BankServiceDeps,
} from '../../../src/data/bank/bank-service.js'

const NOW = Date.parse('2026-09-15T10:00:00Z')
const REDIRECT = 'http://localhost:8765/bank'
const PEM = '-----BEGIN PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----\n'
const BANK: Aspsp = { name: 'Crédit Mutuel de Bretagne', country: 'FR', maximumConsentSeconds: 90 * 24 * 3600 }
const CATEGORIES: Category[] = [{ name: 'Alimentation', icon: 'x' }]

const entry = (id: string, amount: string, date = '2026-09-10') => ({
  entry_reference: id,
  transaction_amount: { currency: 'EUR', amount },
  credit_debit_indicator: 'DBIT' as const,
  status: 'BOOK',
  booking_date: date,
  remittance_information: ['CARREFOUR'],
})

interface Harness {
  service: BankService
  state: { bank: BankState; save: ReturnType<typeof vi.fn> }
  keys: Map<string, string>
  requests: { method: string; url: string; body?: string }[]
  imported: Transaction[]
  openUrl: ReturnType<typeof vi.fn>
  listen: ReturnType<typeof vi.fn>
  notices: BankNotice[]
  answers: Map<string, { status: number; body: unknown } | Error>
  setNow(ms: number): void
}

function harness(initial: Partial<BankState> = {}, deps: Partial<BankServiceDeps> = {}): Harness {
  const stateObject = {
    bank: { ...defaultBankState('2026-09-15', REDIRECT), ...initial },
    save: vi.fn((next: BankState) => {
      stateObject.bank = next
    }),
  }
  const keys = new Map<string, string>()
  const requests: Harness['requests'] = []
  const imported: Transaction[] = []
  const answers: Harness['answers'] = new Map()
  let now = NOW

  const http: BankHttp = async (request) => {
    requests.push({ method: request.method, url: request.url, ...(request.body ? { body: request.body } : {}) })
    const key = Object.keys(Object.fromEntries(answers)).find((candidate) => request.url.includes(candidate))
    const answer = key === undefined ? { status: 404, body: { message: 'unscripted' } } : answers.get(key)!
    if (answer instanceof Error) throw answer
    return { status: answer.status, body: JSON.stringify(answer.body) }
  }

  const openUrl = vi.fn()
  const listen = vi.fn(async (_url: string, _onUrl: (url: string) => void) => ({ close: vi.fn() }))
  const service = new BankService({
    state: stateObject,
    keys: {
      load: async (id) => keys.get(id) ?? '',
      save: async (id, key) => {
        keys.set(id, key)
        return true
      },
      remove: async (id) => {
        keys.delete(id)
      },
    },
    categories: () => CATEGORIES,
    importTransactions: (transactions) => {
      imported.push(...transactions)
      return transactions.length
    },
    openUrl,
    language: () => 'fr',
    http,
    sign: () => 'jwt',
    listen: listen as never,
    now: () => now,
    randomState: () => 'STATE',
    ...deps,
  })
  const notices: BankNotice[] = []
  service.onStatusChange(({ notice }) => {
    if (notice !== null && notice !== notices.at(-1)) notices.push(notice)
  })
  return { service, state: stateObject, keys, requests, imported, openUrl, listen, notices, answers, setNow: (ms) => (now = ms) }
}

const SESSION = {
  sessionId: 's1',
  accounts: [{ uid: 'acc1', label: 'Compte' }],
  validUntil: '2026-12-01T00:00:00Z',
}

/** A harness already holding credentials and a live session. */
function connected(extra: Partial<BankState> = {}): Harness {
  const h = harness({
    config: { ...defaultBankState('2026-09-15', REDIRECT).config, applicationId: 'app', importFrom: '2026-09-01', bankName: BANK.name },
    session: SESSION,
    ...extra,
  })
  h.keys.set('app', PEM)
  return h
}

/** A service over the harness's state and scripted bank, with some dependencies replaced. */
function bareService(h: Harness, deps: Partial<BankServiceDeps>): BankService {
  return new BankService({
    state: h.state,
    keys: { load: async () => PEM, save: async () => true, remove: async () => {} },
    categories: () => [],
    importTransactions: () => 0,
    openUrl: () => {},
    language: () => 'fr',
    http: async (request) => {
      const key = [...h.answers.keys()].find((candidate) => request.url.includes(candidate))
      return { status: 200, body: JSON.stringify(key === undefined ? {} : (h.answers.get(key) as { body: unknown }).body) }
    },
    sign: () => 'jwt',
    now: () => NOW,
    ...deps,
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('credentials', () => {
  it('stores the normalised key and remembers the application id', async () => {
    const h = harness()

    await expect(h.service.saveCredentials(' app ', `  ${PEM}  `)).resolves.toBe(true)

    expect(h.service.state.config.applicationId).toBe('app')
    expect(h.keys.get('app')).toBe(PEM)
    await expect(h.service.hasKey()).resolves.toBe(true)
  })

  it('keeps the existing key when none is given', async () => {
    const h = connected()

    await expect(h.service.saveCredentials('app', '')).resolves.toBe(true)

    expect(h.keys.get('app')).toBe(PEM)
    await expect(h.service.hasKey()).resolves.toBe(true)
  })

  it('refuses a text with no private key, and a refusing keyring', async () => {
    const h = harness()
    await expect(h.service.saveCredentials('app', 'hello')).resolves.toBe(false)
    expect(h.keys.size).toBe(0)

    const refusing = harness({}, { keys: { load: async () => '', save: async () => false, remove: async () => {} } })
    await expect(refusing.service.saveCredentials('app', PEM)).resolves.toBe(false)
  })

  it('forgets the key, the access and the application id', async () => {
    const h = connected()

    await h.service.forgetCredentials()

    expect(h.keys.size).toBe(0)
    expect(h.service.connected).toBe(false)
    expect(h.service.state.config.applicationId).toBe('')
  })
})

describe('saveSettings', () => {
  it('saves a valid date and the redirect address', () => {
    const h = harness()

    expect(h.service.saveSettings(` ${REDIRECT} `, ' 2026-01-01 ')).toBe(true)

    expect(h.service.state.config).toMatchObject({ redirectUrl: REDIRECT, importFrom: '2026-01-01' })
  })

  it('refuses a malformed date', () => {
    const h = harness()

    expect(h.service.saveSettings(REDIRECT, '01/01/2026')).toBe(false)

    expect(h.notices).toEqual([{ code: 'invalid-date' }])
    expect(h.state.save).not.toHaveBeenCalled()
  })
})

describe('listBanks', () => {
  it('asks the bank directory once and caches a non-empty answer', async () => {
    const h = connected()
    h.answers.set('/aspsps', { status: 200, body: { aspsps: [{ name: BANK.name, country: 'FR', maximum_consent_validity: 100 }] } })

    const first = await h.service.listBanks()
    await h.service.listBanks()

    expect(first).toEqual([{ ...BANK, maximumConsentSeconds: 100 }])
    expect(h.requests).toHaveLength(1)
  })

  it('does not cache an empty answer', async () => {
    const h = connected()
    h.answers.set('/aspsps', { status: 200, body: { aspsps: [] } })

    await h.service.listBanks()
    await h.service.listBanks()

    expect(h.requests).toHaveLength(2)
  })

  it('asks for the credentials when there are none', async () => {
    const h = harness()

    await expect(h.service.listBanks()).resolves.toEqual([])

    expect(h.notices).toEqual([{ code: 'missing-credentials' }])
  })

  it('reports a transport failure', async () => {
    const h = connected()
    h.answers.set('/aspsps', new Error('offline'))

    await expect(h.service.listBanks()).resolves.toEqual([])

    expect(h.notices).toEqual([{ code: 'network' }])
  })
})

describe('connect', () => {
  it('starts the authorisation, listens for the return and opens the bank page', async () => {
    const h = connected({ session: null })
    h.answers.set('/auth', { status: 200, body: { url: 'https://bank.example/auth' } })

    await h.service.connect(BANK)

    expect(JSON.parse(h.requests[0]!.body!)).toMatchObject({ state: 'STATE', redirect_url: REDIRECT, language: 'fr' })
    expect(h.service.state).toMatchObject({ pendingState: 'STATE', config: { bankName: BANK.name, bankCountry: 'FR' } })
    expect(h.listen).toHaveBeenCalledWith(REDIRECT, expect.any(Function))
    expect(h.openUrl).toHaveBeenCalledWith('https://bank.example/auth')
    expect(h.notices).toEqual([{ code: 'waiting', listening: true }])
  })

  it('tells the user to paste the address when nothing can listen', async () => {
    const h = connected({ session: null })
    h.answers.set('/auth', { status: 200, body: { url: 'https://bank.example/auth' } })
    h.listen.mockRejectedValueOnce(new Error('not-loopback'))

    await h.service.connect(BANK)

    expect(h.notices).toEqual([{ code: 'waiting', listening: false }])
    expect(h.openUrl).toHaveBeenCalled()
  })

  it('replaces a listener left over from an earlier attempt', async () => {
    const h = connected({ session: null })
    h.answers.set('/auth', { status: 200, body: { url: 'https://bank.example/auth' } })
    const stale = { close: vi.fn() }
    h.listen.mockResolvedValueOnce(stale)

    await h.service.connect(BANK)
    await h.service.connect(BANK)

    expect(stale.close).toHaveBeenCalled()
  })

  it('does not open anything when the bank refuses the request', async () => {
    const h = connected({ session: null })
    h.answers.set('/auth', { status: 401, body: { message: 'bad key' } })

    await h.service.connect(BANK)

    expect(h.openUrl).not.toHaveBeenCalled()
    expect(h.notices).toEqual([{ code: 'auth', detail: 'bad key' }])
  })

  it('uses the real random state by default', async () => {
    const h = connected({ session: null })
    const plain = new BankService({
      state: h.state,
      keys: { load: async () => PEM, save: async () => true, remove: async () => {} },
      categories: () => [],
      importTransactions: () => 0,
      openUrl: () => {},
      language: () => 'en',
      http: async () => ({ status: 200, body: '{"url":"https://bank.example/auth"}' }),
      sign: () => 'jwt',
      listen: (async () => ({ close() {} })) as never,
    })

    await plain.connect(BANK)

    expect(plain.state.pendingState.length).toBeGreaterThan(8)
  })
})

describe('handleRedirect', () => {
  const sessionAnswer = {
    status: 200,
    body: { session_id: 's1', accounts: [{ uid: 'acc1', details: 'Compte' }], access: { valid_until: '2026-12-01T00:00:00Z' } },
  }

  it('opens the session from the returned address, then imports', async () => {
    const h = connected({ session: null, pendingState: 'STATE' })
    h.answers.set('/sessions', sessionAnswer)
    h.answers.set('/transactions', { status: 200, body: { transactions: [entry('e1', '12.50')] } })

    await h.service.handleRedirect(`${REDIRECT}?code=abc&state=STATE`)

    expect(h.service.state).toMatchObject({ pendingState: '', session: { sessionId: 's1' } })
    expect(h.imported).toHaveLength(1)
    expect(h.notices.at(-1)).toEqual({ code: 'imported', count: 1 })
  })

  it('accepts a bare code pasted by hand', async () => {
    const h = connected({ session: null, pendingState: 'STATE' })
    h.answers.set('/sessions', sessionAnswer)
    h.answers.set('/transactions', { status: 200, body: { transactions: [] } })

    await h.service.handleRedirect('abc')

    expect(h.service.connected).toBe(true)
  })

  it('reports the bank refusing the authorisation', async () => {
    const h = connected({ session: null, pendingState: 'STATE' })

    await h.service.handleRedirect(`${REDIRECT}?error=access_denied`)

    expect(h.notices).toEqual([{ code: 'refused', detail: 'access_denied' }])
  })

  it('rejects a return that does not match a pending connection', async () => {
    const h = connected({ session: null, pendingState: 'STATE' })
    await h.service.handleRedirect(`${REDIRECT}?code=abc&state=OTHER`)
    const idle = connected({ session: null })
    await idle.service.handleRedirect('abc')

    expect(h.notices).toEqual([{ code: 'unexpected-return' }])
    expect(idle.notices).toEqual([{ code: 'unexpected-return' }])
  })

  it('reports a return without a code', async () => {
    const h = connected({ session: null, pendingState: 'STATE' })

    await h.service.handleRedirect(`${REDIRECT}?state=STATE`)

    expect(h.notices).toEqual([{ code: 'no-code' }])
  })

  it('needs the credentials', async () => {
    const h = harness({ pendingState: 'STATE' })

    await h.service.handleRedirect('abc')

    expect(h.notices).toEqual([{ code: 'missing-credentials' }])
  })

  it('reports a failed code exchange and stays disconnected', async () => {
    const h = connected({ session: null, pendingState: 'STATE' })
    h.answers.set('/sessions', { status: 400, body: { message: 'bad code' } })

    await h.service.handleRedirect('abc')

    expect(h.notices).toEqual([{ code: 'failed', detail: 'bad code' }])
    expect(h.service.connected).toBe(false)
  })

  it('is triggered by the listener', async () => {
    const h = connected({ session: null })
    h.answers.set('/auth', { status: 200, body: { url: 'https://bank.example/auth' } })
    h.answers.set('/sessions', sessionAnswer)
    h.answers.set('/transactions', { status: 200, body: { transactions: [] } })
    await h.service.connect(BANK)

    const onUrl = h.listen.mock.calls[0]![1] as (url: string) => void
    onUrl(`${REDIRECT}?code=abc&state=STATE`)
    await vi.waitFor(() => expect(h.service.connected).toBe(true))
  })
})

describe('importNow', () => {
  it('brings new transactions in, remembers them and stamps the import', async () => {
    const h = connected()
    h.answers.set('/transactions', { status: 200, body: { transactions: [entry('e1', '12.50'), entry('e2', '3')] } })

    await h.service.importNow()

    expect(h.imported).toHaveLength(2)
    expect(h.requests[0]!.url).toContain('date_from=2026-09-01')
    expect(h.service.state.importedIds).toEqual(h.imported.map(({ id }) => id))
    expect(h.service.state.lastImportAt).toBe(new Date(NOW).toISOString())
    expect(h.notices).toEqual([{ code: 'imported', count: 2 }])
  })

  it('never brings the same transaction twice', async () => {
    const h = connected()
    h.answers.set('/transactions', { status: 200, body: { transactions: [entry('e1', '12.50')] } })

    await h.service.importNow()
    await h.service.importNow()

    expect(h.imported).toHaveLength(1)
    expect(h.notices.at(-1)).toEqual({ code: 'imported', count: 0 })
  })

  it('looks back a little before the last import', async () => {
    const h = connected({ lastImportAt: '2026-09-14T08:00:00.000Z' })
    h.answers.set('/transactions', { status: 200, body: { transactions: [] } })

    await h.service.importNow()

    expect(h.requests[0]!.url).toContain('date_from=2026-09-07')
  })

  it('asks to connect first, or to connect again once the access expired', async () => {
    const none = connected({ session: null })
    await none.service.importNow()
    const old = connected({ session: { ...SESSION, validUntil: '2026-09-01T00:00:00Z' } })
    await old.service.importNow()

    expect(none.notices).toEqual([{ code: 'not-connected' }])
    expect(old.notices).toEqual([{ code: 'expired' }])
    expect(old.service.expired).toBe(true)
  })

  it('stays quiet on an unattended run', async () => {
    const none = connected({ session: null })
    await none.service.importNow(true)
    const old = connected({ session: { ...SESSION, validUntil: '2026-09-01T00:00:00Z' } })
    await old.service.importNow(true)
    const bare = harness({ session: SESSION })
    await bare.service.importNow(true)
    const offline = connected()
    offline.answers.set('/transactions', new Error('offline'))
    await offline.service.importNow(true)

    for (const h of [none, old, bare, offline]) expect(h.notices).toEqual([])
  })

  it('classifies what the bank answers', async () => {
    const cases: [number, unknown, BankNotice][] = [
      [429, {}, { code: 'rate-limit' }],
      [401, { error: 'SESSION_CLOSED' }, { code: 'expired' }],
      [500, {}, { code: 'network' }],
      [400, { message: 'nope' }, { code: 'failed', detail: 'nope' }],
    ]
    for (const [status, body, expected] of cases) {
      const h = connected()
      h.answers.set('/transactions', { status, body })
      await h.service.importNow()
      expect(h.notices).toEqual([expected])
    }
  })

  it('reports an unexpected error, such as a budget that cannot be written', async () => {
    const thrown: unknown[] = [new Error('serveur injoignable'), 'boom']
    const notices: BankNotice[] = []
    for (const error of thrown) {
      const h = connected()
      h.answers.set('/transactions', { status: 200, body: { transactions: [entry('e1', '1')] } })
      const failing = bareService(h, {
        importTransactions: () => {
          throw error
        },
      })
      await failing.importNow()
      notices.push(failing.status.notice!)
      expect(failing.state.lastImportAt).toBe('')
    }

    expect(notices).toEqual([
      { code: 'failed', detail: 'serveur injoignable' },
      { code: 'failed', detail: 'boom' },
    ])
  })
})

describe('disconnect', () => {
  it('forgets the access but keeps what was imported', () => {
    const h = connected({ importedIds: ['a'], pendingState: 'x' })

    h.service.disconnect()

    expect(h.service.state).toMatchObject({ session: null, pendingState: '', importedIds: ['a'] })
  })
})

describe('status listeners', () => {
  it('stop being called once unsubscribed', async () => {
    const h = connected()
    const listener = vi.fn()
    const unsubscribe = h.service.onStatusChange(listener)
    unsubscribe()

    h.service.disconnect()

    expect(listener).not.toHaveBeenCalled()
  })

  it('see the busy flag while a call is running', async () => {
    const h = connected()
    h.answers.set('/transactions', { status: 200, body: { transactions: [] } })
    const busy: boolean[] = []
    h.service.onStatusChange((status) => busy.push(status.busy))

    await h.service.importNow()

    expect(busy[0]).toBe(true)
    expect(busy.at(-1)).toBe(false)
    expect(h.service.status.busy).toBe(false)
  })
})

describe('automatic import', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('imports at start when connected and never imported, then checks again regularly', async () => {
    const h = connected()
    h.answers.set('/transactions', { status: 200, body: { transactions: [] } })

    h.service.start()
    h.service.start() // idempotent
    await vi.advanceTimersByTimeAsync(0)
    expect(h.requests).toHaveLength(1)

    h.setNow(NOW + 7 * 3600 * 1000)
    await vi.advanceTimersByTimeAsync(BANK_AUTO_IMPORT_CHECK_MS)
    expect(h.requests).toHaveLength(2)

    h.service.dispose()
  })

  it('waits when the last import is recent, or when not connected', async () => {
    const recent = connected({ lastImportAt: new Date(NOW - 3600 * 1000).toISOString() })
    recent.service.start()
    const idle = connected({ session: null })
    idle.service.start()
    await vi.advanceTimersByTimeAsync(0)

    expect(recent.requests).toHaveLength(0)
    expect(idle.requests).toHaveLength(0)
    recent.service.dispose()
    idle.service.dispose()
  })

  it('does not stack imports while one is running', async () => {
    const h = connected()
    let release: (value: { status: number; body: string }) => void = () => {}
    const slow = new BankService({
      state: h.state,
      keys: { load: async () => PEM, save: async () => true, remove: async () => {} },
      categories: () => [],
      importTransactions: () => 0,
      openUrl: () => {},
      language: () => 'fr',
      http: () => new Promise((resolve) => (release = resolve)),
      sign: () => 'jwt',
      now: () => NOW,
    })

    slow.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(slow.status.busy).toBe(true)
    await vi.advanceTimersByTimeAsync(BANK_AUTO_IMPORT_CHECK_MS)
    release({ status: 200, body: '{}' })
    await vi.advanceTimersByTimeAsync(0)

    slow.dispose()
  })
})
