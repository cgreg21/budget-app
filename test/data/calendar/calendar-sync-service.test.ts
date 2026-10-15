import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CATEGORY_ICON, base64Utf8, categoriesToIcs, icsToCategories, CATEGORIES_BASELINE_KEY, transactionToIcs, icsToTransaction, type CalendarConfig, type HttpRequest, type HttpResponse, type Transaction } from 'budget-lib'
import { createTempUserDataDir, removeTempUserDataDir, writeJson, type TempDataDir } from '../../helpers/temp-data-dir.js'

const config: CalendarConfig = { enabled: true, calendarUrl: 'https://dav.test/cal', username: 'alice', syncIntervalMinutes: 0 }
const tx = (overrides: Partial<Transaction> = {}): Transaction => ({ id: 't1', date: '2026-09-10', description: 'Coffee', category: 'Cafe', kind: 'expense', amount: 12, ...overrides })

function fakeServer() {
  const events = new Map<string, { ics: string, version: number }>()
  let offline = false
  let failure: number | undefined
  let hold: (() => Promise<void>) | undefined
  let active = 0
  let maxActive = 0
  const transport = vi.fn(async (request: HttpRequest): Promise<HttpResponse> => {
    active++
    maxActive = Math.max(maxActive, active)
    try {
      if (hold) await hold()
      if (offline) throw new TypeError('Network unavailable')
      const response = (status: number, body = '', headers: Record<string, string> = {}): HttpResponse => ({ status, body, headers })
      if (failure) return response(failure)
      if (request.headers.Authorization !== 'Basic ' + base64Utf8('alice:password')) return response(401)
      const href = new URL(request.url).pathname
      if (request.method === 'PROPFIND') return response(207)
      if (request.method === 'REPORT') return response(207, '<d:multistatus xmlns:d="DAV:">' + [...events].map(([href, event]) => '<d:response><d:href>' + href + '</d:href><d:propstat><d:prop><d:getetag>"' + event.version + '"</d:getetag><c:calendar-data xmlns:c="urn:ietf:params:xml:ns:caldav"><![CDATA[' + event.ics + ']]></c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>').join('') + '</d:multistatus>')
      if (request.method === 'PUT') {
        const existing = events.get(href)
        if (request.headers['If-None-Match'] === '*' && existing) return response(412)
        if (request.headers['If-Match'] && request.headers['If-Match'] !== '"' + existing?.version + '"') return response(412)
        const version = (existing?.version ?? 0) + 1
        events.set(href, { ics: request.body ?? '', version })
        return response(existing ? 204 : 201, '', { etag: '"' + version + '"' })
      }
      if (request.method === 'DELETE') return response(events.delete(href) ? 204 : 404)
      return response(405)
    } finally { active-- }
  })
  const transactionCount = () => [...events.keys()].filter((href) => !href.endsWith('/categories.ics') && !href.includes('recurrence-')).length
  return { events, transport, transactionCount,
    add: (transaction: Transaction, version = 1) => events.set('/cal/' + transaction.id + '.ics', { ics: transactionToIcs(transaction), version }),
    offline: (value: boolean) => { offline = value }, failure: (value?: number) => { failure = value },
    hold: (value?: () => Promise<void>) => { hold = value }, maxActive: () => maxActive }
}

type ServiceModule = typeof import('../../../src/data/calendar/calendar-sync-service.js')
type BudgetModule = typeof import('../../../src/data/budget-store.js')
type CategoriesModule = typeof import('../../../src/data/category-store.js')
type RecurrencesModule = typeof import('../../../src/data/recurrence-store.js')
let temp: TempDataDir
let Service: ServiceModule['CalendarSyncService']
let Budget: BudgetModule['BudgetStore']
let Categories: CategoriesModule['CategoryStore']
let Recurrences: RecurrencesModule['RecurrenceStore']
const opened: { dispose(): void }[] = []
function track<T extends { dispose(): void }>(value: T): T { opened.push(value); return value }
async function setup(server = fakeServer()) {
  const recurrences = track(new Recurrences())
  const budget = track(new Budget(recurrences))
  budget.selectMonth('2026-09')
  const categories = track(new Categories())
  const service = track(new Service({ budgetStore: budget, categoryStore: categories, recurrenceStore: recurrences, transport: server.transport }))
  await service.savePassword(config, 'password')
  service.saveConfig(config)
  return { service, budget, categories, recurrences, server }
}
beforeEach(async () => {
  temp = createTempUserDataDir()
  vi.spyOn(fs, 'watch').mockImplementation(() => ({ close() {} }) as fs.FSWatcher)
  const { clearStubbedKeyring } = await import('../../helpers/secret-stub.js')
  clearStubbedKeyring()
  ;({ CalendarSyncService: Service } = await import('../../../src/data/calendar/calendar-sync-service.js'))
  ;({ BudgetStore: Budget } = await import('../../../src/data/budget-store.js'))
  ;({ CategoryStore: Categories } = await import('../../../src/data/category-store.js'))
  ;({ RecurrenceStore: Recurrences } = await import('../../../src/data/recurrence-store.js'))
})
afterEach(() => {
  for (const value of opened.splice(0).reverse()) value.dispose()
  vi.useRealTimers()
  vi.restoreAllMocks()
  removeTempUserDataDir(temp)
})

describe('calendar settings and credentials', () => {
  it('defaults to disabled and makes no requests', async () => {
    const { service, server } = await setup()
    service.saveConfig({ enabled: false, calendarUrl: '', username: '' })
    service.start()
    await service.syncNow()
    expect(service.status.state).toBe('disabled')
    expect(server.transport).not.toHaveBeenCalled()
  })
  it('persists normalized non-secret config and clears baseline only when the account changes', async () => {
    const { service, budget, server } = await setup()
    budget.importTransactions([tx()])
    await service.syncNow()
    service.saveConfig({ ...config, calendarUrl: ' https://dav.test/cal/ ', username: ' alice ', enabled: false })
    expect(service.config).toEqual({ ...config, enabled: false })
    const saved = JSON.parse(fs.readFileSync(path.join(temp.dataDir, 'calendar.json'), 'utf8'))
    expect(saved.baseline.t1).toBeDefined()
    expect(JSON.stringify(saved)).not.toContain('password')
    server.transport.mockClear()
    await service.syncNow()
    expect(server.transport).not.toHaveBeenCalled()
    service.saveConfig({ ...config, calendarUrl: 'https://dav.test/other' })
    expect(JSON.parse(fs.readFileSync(path.join(temp.dataDir, 'calendar.json'), 'utf8')).baseline).toEqual({})
  })
  it('tests credentials with PROPFIND without saving changes', async () => {
    const { service, server } = await setup()
    await service.checkConnection(config, 'password')
    expect(server.transport.mock.calls[0][0].method).toBe('PROPFIND')
    await expect(service.checkConnection(config, 'wrong')).rejects.toThrow('Authentification')
    expect(service.config).toEqual(config)
  })
  it('reports missing credentials and invalid URLs', async () => {
    const { service, server } = await setup()
    service.saveConfig({ ...config, username: 'missing' })
    await service.syncNow()
    expect(service.status.state).toBe('error')
    expect(server.transport).not.toHaveBeenCalled()
    await expect(service.hasPassword({ ...config, username: 'missing' })).resolves.toBe(false)
    await expect(service.loadPassword(config)).resolves.toBe('password')
    await expect(service.loadPassword({ ...config, username: 'missing' })).resolves.toBe('')
    expect(() => service.saveConfig({ ...config, calendarUrl: 'invalid' })).toThrow()
  })
})

describe('calendar category synchronization', () => {
  const remote = [{ name: 'Zoo', icon: 'paw' }, { name: 'Cafe', icon: 'coffee' }]
  const addList = (server: ReturnType<typeof fakeServer>, list = remote, version = 1) =>
    server.events.set('/cal/categories.ics', { ics: categoriesToIcs(list), version })
  const stored = (server: ReturnType<typeof fakeServer>) =>
    [...server.events].map(([, event]) => icsToCategories(event.ics)).find((list) => list !== null)
  it('stores the downloaded list, keeping local-only categories', async () => {
    const { service, categories, server } = await setup()
    categories.replaceAll([{ name: 'Local', icon: 'star' }, { name: 'Cafe', icon: 'x' }])
    addList(server)
    await service.syncNow()
    expect(categories.categories).toEqual([...remote, { name: 'Local', icon: 'star' }])
    expect(stored(server)).toEqual(categories.categories)
    const baseline = JSON.parse(fs.readFileSync(path.join(temp.dataDir, 'calendar.json'), 'utf8')).baseline
    expect(baseline[CATEGORIES_BASELINE_KEY]).toMatchObject({ href: '/cal/categories.ics' })
  })
  it('deduces categories from downloaded transactions', async () => {
    const { service, categories, server } = await setup()
    server.add(tx({ category: 'Brand new' }))
    await service.syncNow()
    expect(categories.categories.map((category) => category.name)).toContain('Brand new')
    expect(stored(server)?.map((category) => category.name)).toContain('Brand new')
  })
  it('uploads the local list and tolerates the baseline key on restart', async () => {
    const { service, categories, server } = await setup()
    await service.syncNow()
    expect(stored(server)).toEqual(categories.categories)
    service.dispose()
    const again = track(new Service({ budgetStore: track(new Budget(track(new Recurrences()))), categoryStore: categories, recurrenceStore: track(new Recurrences()), transport: server.transport }))
    server.transport.mockClear()
    await again.syncNow()
    expect(server.transport.mock.calls.some(([request]) => request.method === 'PUT')).toBe(false)
    expect(again.status.state).toBe('online')
  })
  it('does not write the category store when nothing changed', async () => {
    const { service, categories, server } = await setup()
    await service.syncNow()
    const replace = vi.spyOn(categories, 'replaceAll')
    await service.syncNow()
    expect(replace).not.toHaveBeenCalled()
  })
  it('syncs after a local category edit, and keeps an edit made during the run', async () => {
    vi.useFakeTimers()
    const { service, categories, server } = await setup()
    service.start()
    await service.syncNow()
    server.transport.mockClear()
    categories.replaceAll(categories.categories)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(server.transport).not.toHaveBeenCalled()
    categories.add('Fresh')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(stored(server)?.map((category) => category.name)).toContain('Fresh')
    server.transport.mockClear()
    addList(server, [{ name: 'Zoo', icon: 'paw' }], 5)
    let release = () => {}
    server.hold(() => new Promise<void>((resolve) => { release = resolve }))
    const run = service.syncNow()
    await vi.advanceTimersByTimeAsync(0)
    categories.add('Midway')
    server.hold(undefined)
    release()
    await run
    expect(categories.categories.map((category) => category.name)).toContain('Midway')
    expect(stored(server)?.map((category) => category.name)).toContain('Midway')
  })
})

describe('calendar transaction synchronization', () => {
  it('uploads all months, creates categories, and applies remote edits, month moves and deletions', async () => {
    writeJson(path.join(temp.monthsDir, '2025-01.json'), [tx({ id: 'older', date: '2025-01-01' })])
    const { service, budget, categories, server } = await setup()
    server.add(tx())
    await service.syncNow()
    expect(server.events.has('/cal/older.ics')).toBe(true)
    expect(budget.allTransactions).toHaveLength(2)
    expect(categories.categories).toContainEqual({ name: 'Cafe', icon: DEFAULT_CATEGORY_ICON })
    server.add(tx({ date: '2026-10-10', amount: 99 }), 2)
    await service.syncNow()
    expect(budget.transactions).toEqual([])
    expect(budget.allTransactions.find((t) => t.id === 't1')).toMatchObject({ date: '2026-10-10', amount: 99 })
    expect(budget.selectedMonth).toBe('2026-09')
    server.events.delete('/cal/t1.ics')
    await service.syncNow()
    expect(budget.allTransactions.map((t) => t.id)).toEqual(['older'])
  })
  it('uploads local edits and propagates local deletions', async () => {
    const { service, budget, server } = await setup()
    budget.importTransactions([tx()])
    await service.syncNow()
    budget.update('t1', tx({ amount: 42 }))
    await service.syncNow()
    expect(icsToTransaction(server.events.get('/cal/t1.ics')!.ics)?.amount).toBe(42)
    budget.remove('t1')
    await service.syncNow()
    // A deleted transaction stays on the server as a trashed (cancelled) event.
    expect(server.transactionCount()).toBe(1)
    expect(icsToTransaction(server.events.get('/cal/t1.ics')!.ics)).toBeNull()
    expect(budget.trash.map((item) => item.id)).toEqual(['t1'])
    budget.emptyTrash()
    await service.syncNow()
    expect(server.transactionCount()).toBe(0)
  })
  it('restores a trashed transaction from the calendar side', async () => {
    const { service, budget, server } = await setup()
    budget.importTransactions([tx()])
    await service.syncNow()
    budget.remove('t1')
    await service.syncNow()
    server.add(tx(), 2)
    await service.syncNow()
    expect(budget.trash).toEqual([])
    expect(budget.allTransactions.map((item) => item.id)).toEqual(['t1'])
  })
  it('does not loop on downloads or delayed file notifications', async () => {
    vi.useFakeTimers()
    const { service, budget, server } = await setup()
    server.add(tx())
    service.start()
    await service.syncNow()
    const count = server.transport.mock.calls.length
    budget.reload(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(server.transport).toHaveBeenCalledTimes(count)
  })
  it('debounces local changes including bank imports into existing non-selected months', async () => {
    vi.useFakeTimers()
    const { service, budget, server } = await setup()
    service.start()
    await service.syncNow()
    budget.importTransactions([tx({ id: 'bank1', date: '2025-01-01' })])
    await vi.advanceTimersByTimeAsync(2_000)
    server.transport.mockClear()
    budget.importTransactions([tx({ id: 'bank2', date: '2025-01-02' })])
    await vi.advanceTimersByTimeAsync(1_500)
    expect(server.transport).not.toHaveBeenCalled()
    budget.importTransactions([tx({ id: 'bank3', date: '2025-01-03' })])
    await vi.advanceTimersByTimeAsync(1_999)
    expect(server.transport).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(server.transactionCount()).toBe(3)
    expect(budget.selectedMonth).toBe('2026-09')
  })
  it('debounces transaction creation, series edits and deletions', async () => {
    vi.useFakeTimers()
    const { service, budget, server } = await setup()
    service.start()
    await service.syncNow()
    budget.addRecurring(tx(), { frequency: 'monthly' })
    await vi.advanceTimersByTimeAsync(2_000)
    const occurrence = budget.transactions[0]
    expect(server.transactionCount()).toBe(1)
    expect(icsToTransaction([...server.events].find(([href]) => href !== '/cal/categories.ics' && !href.includes('recurrence-'))![1].ics)?.recurrenceId).toBe(occurrence.recurrenceId)
    expect([...server.events.keys()].some((href) => href.includes('recurrence-'))).toBe(true)
    budget.updateSeries(occurrence.id, { ...occurrence, amount: 90 }, { frequency: 'monthly' })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(icsToTransaction([...server.events].find(([href]) => href !== '/cal/categories.ics' && !href.includes('recurrence-'))![1].ics)?.amount).toBe(90)
    budget.updateSeries(occurrence.id, { ...occurrence, amount: 90 }, null)
    budget.remove(occurrence.id)
    await vi.advanceTimersByTimeAsync(2_000)
    // The deleted occurrence stays on the server as a trashed event.
    expect(server.transactionCount()).toBe(1)
  })

  it('preserves recurrence stamps and does not recreate remote deletions during application', async () => {
    const { service, budget, recurrences, server } = await setup()
    budget.selectMonth('2026-08')
    recurrences.insert({ id: 'series', description: 'Rent', category: 'Cafe', amount: 12, kind: 'expense', day: 10, frequency: 'monthly', startMonth: '2026-09' })
    server.add(tx({ recurrenceId: 'series' }))
    await service.syncNow()
    budget.selectMonth('2026-09')
    expect(budget.transactions).toEqual([tx({ recurrenceId: 'series' })])
    budget.reload()
    expect(budget.transactions).toHaveLength(1)
    server.events.clear()
    await service.syncNow()
    expect(budget.transactions).toHaveLength(0)
  })
  it('serializes runs and preserves concurrent local edits during a download', async () => {
    const { service, budget, server } = await setup()
    budget.importTransactions([tx()])
    await service.syncNow()
    service.start()
    await service.syncNow()
    server.add(tx({ amount: 55 }), 2)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    server.hold(() => gate)
    const before = server.transport.mock.calls.length
    const running = service.syncNow()
    await vi.waitFor(() => expect(server.transport.mock.calls.length).toBeGreaterThan(before))
    budget.update('t1', tx({ amount: 77 }))
    expect(service.syncNow()).toBe(running)
    server.hold()
    release()
    await running
    expect(server.maxActive()).toBe(1)
    expect(budget.transactions[0].amount).toBe(77)
    expect(icsToTransaction(server.events.get('/cal/t1.ics')!.ics)?.amount).toBe(77)
  })
  it('keeps a trash edit made during a run and sends it in the next one', async () => {
    const { service, budget, server } = await setup()
    budget.importTransactions([tx(), tx({ id: 't2' })])
    await service.syncNow()
    server.add(tx({ id: 't3' }), 2)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    server.hold(() => gate)
    const before = server.transport.mock.calls.length
    const running = service.syncNow()
    await vi.waitFor(() => expect(server.transport.mock.calls.length).toBeGreaterThan(before))
    budget.remove('t1')
    server.hold()
    release()
    await running
    expect(budget.trash.map((item) => item.id)).toEqual(['t1'])
    expect(icsToTransaction(server.events.get('/cal/t1.ics')!.ics)).toBeNull()
  })
  it('persists baseline across restarts, so calendar deletions are not resurrected', async () => {
    const { service, budget, categories, server } = await setup()
    budget.importTransactions([tx()])
    await service.syncNow()
    service.dispose()
    server.events.clear()
    const next = track(new Service({ budgetStore: budget, categoryStore: categories, recurrenceStore: track(new Recurrences()), transport: server.transport }))
    await next.syncNow()
    expect(budget.allTransactions).toEqual([])
    expect(next.status.lastSync).toBeDefined()
  })
})

describe('offline and lifecycle', () => {
  it('keeps local editing available, retries when connectivity returns, and resumes in foreground', async () => {
    vi.useFakeTimers()
    const { service, budget, server } = await setup()
    server.offline(true)
    service.start()
    await service.syncNow()
    expect(service.status.state).toBe('offline')
    budget.importTransactions([tx()])
    budget.update('t1', tx({ amount: 88 }))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(budget.transactions[0].amount).toBe(88)
    server.offline(false)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(service.status.state).toBe('online')
    expect(server.transactionCount()).toBe(1)
    server.add(tx({ amount: 99 }), 2)
    service.resume()
    await service.syncNow()
    expect(budget.transactions[0].amount).toBe(99)
  })
  it.each([401, 403, 404, 412, 500])('reports HTTP %s as error, not offline', async (status) => {
    const { service, server } = await setup()
    server.failure(status)
    await service.syncNow()
    expect(service.status.state).toBe('error')
    expect(service.status.message).toBeTruthy()
  })
  it.each(['disable', 'dispose'])('discards in-flight results on %s', async (action) => {
    const { service, budget, server } = await setup()
    server.add(tx())
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    server.hold(() => gate)
    const running = service.syncNow()
    await vi.waitFor(() => expect(server.transport).toHaveBeenCalled())
    if (action === 'disable') service.saveConfig({ ...config, enabled: false })
    else service.dispose()
    server.hold()
    release()
    await running
    expect(budget.allTransactions).toEqual([])
  })
  it('ignores a failure that lands after disposal', async () => {
    const { service, server } = await setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    server.hold(() => gate)
    const running = service.syncNow()
    await vi.waitFor(() => expect(server.transport).toHaveBeenCalled())
    server.offline(true)
    service.dispose()
    server.hold()
    release()
    await running
    expect(service.status.state).toBe('syncing')
  })
  it('reports being offline without scheduling a retry before start', async () => {
    vi.useFakeTimers()
    const { service, server } = await setup()
    server.offline(true)
    await service.syncNow()
    expect(service.status).toMatchObject({ state: 'offline', message: 'Agenda inaccessible' })
    server.offline(false)
    server.transport.mockClear()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(server.transport).not.toHaveBeenCalled()
  })
  it('wraps a transport that throws something other than an Error', async () => {
    const server = fakeServer()
    const transport = vi.fn(async () => { throw 'cable unplugged' }) as unknown as typeof server.transport
    const { service } = await setup({ ...server, transport })
    await service.syncNow()
    expect(service.status.state).toBe('offline')
    await expect(service.checkConnection(config, 'password')).rejects.toThrow('Agenda inaccessible')
  })
  it('reports a password store failure that is not an Error', async () => {
    const { budget, categories, server } = await setup()
    const passwords = { load: async () => { throw 'keyring locked' }, save: async () => true, backendName: async () => null }
    const service = track(new Service({ budgetStore: budget,     categoryStore: categories, recurrenceStore: track(new Recurrences()), transport: server.transport, passwords: passwords as never }))
    await service.syncNow()
    expect(service.status).toMatchObject({ state: 'error', message: 'keyring locked' })
  })
  it('retries later when the server refused some events, and flushes a pending debounce on demand', async () => {
    vi.useFakeTimers()
    const server = fakeServer()
    let refusePut = true
    const transport = vi.fn(async (request: HttpRequest) => (refusePut && request.method === 'PUT'
      ? { status: 412, headers: {}, body: '' }
      : server.transport(request))) as unknown as typeof server.transport
    const { service, budget } = await setup({ ...server, transport })
    budget.importTransactions([tx()])
    await service.syncNow()
    expect(server.transactionCount()).toBe(0)
    service.start()
    await service.syncNow()
    expect(service.status.state).toBe('online')
    budget.importTransactions([tx({ id: 't2', date: '2026-09-11' })])
    await service.syncNow()
    refusePut = false
    await vi.advanceTimersByTimeAsync(60_000)
    expect(server.transactionCount()).toBe(2)
  })
  it('starts only once and notifies status listeners until they unsubscribe', async () => {
    const { service, server } = await setup()
    const listener = vi.fn()
    const unsubscribe = service.onStatusChange(listener)
    service.start()
    service.start()
    await service.syncNow()
    expect(listener).toHaveBeenCalled()
    expect(server.transport.mock.calls.some(([request]) => request.method === 'REPORT')).toBe(true)
    const calls = listener.mock.calls.length
    unsubscribe()
    await service.syncNow()
    expect(listener).toHaveBeenCalledTimes(calls)
  })
})

describe('settings validation', () => {
  it('refuses to enable synchronization with an incomplete address', async () => {
    const { service } = await setup()
    expect(() => service.saveConfig({ enabled: true, calendarUrl: 'ftp://dav.test/cal', username: 'alice' })).toThrow('Indiquez')
    await expect(service.checkConnection({ enabled: true, calendarUrl: 'ftp://dav.test/cal', username: 'alice' })).rejects.toThrow('Indiquez')
    await expect(service.savePassword({ enabled: true, calendarUrl: '', username: 'alice' }, 'x')).rejects.toThrow('Indiquez')
  })
  it('needs a saved password to test the connection without one given', async () => {
    const { service, server } = await setup()
    await expect(service.checkConnection({ ...config, username: 'nobody' })).rejects.toThrow('Indiquez')
    await expect(service.checkConnection(config)).resolves.toBeUndefined()
    expect(server.transport).toHaveBeenCalledTimes(1)
  })
  it('reports the connection test as offline when the server cannot be reached', async () => {
    const { service, server } = await setup()
    server.offline(true)
    await expect(service.checkConnection(config, 'password')).rejects.toThrow('Agenda inaccessible')
  })
  it('passes an unexpected failure of the connection test through', async () => {
    const server = fakeServer()
    const transport = vi.fn(async () => null as never) as unknown as typeof server.transport
    const { service } = await setup({ ...server, transport })
    await expect(service.checkConnection(config, 'password')).rejects.toThrow(TypeError)
  })
  it('drops a run whose password arrives after disposal', async () => {
    const { budget, categories, server } = await setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const passwords = { load: async () => { await gate; return 'password' }, save: async () => true, backendName: async () => null }
    const service = track(new Service({ budgetStore: budget,     categoryStore: categories, recurrenceStore: track(new Recurrences()), transport: server.transport, passwords: passwords as never }))
    const running = service.syncNow()
    service.dispose()
    release()
    await running
    expect(service.status.state).toBe('syncing')
    expect(server.transport).not.toHaveBeenCalled()
  })
  it('tells where the password is kept', async () => {
    const { service } = await setup()
    await expect(service.passwordStorage()).resolves.toBe('keyring')
  })
  it('reports a password that could not be kept, ignores resume before start and leaves a shared state store open', async () => {
    const { budget, categories, server } = await setup()
    const { CalendarStateStore } = await import('../../../src/data/calendar/calendar-state-store.js')
    const stateStore = track(new CalendarStateStore())
    const passwords = { load: async () => '', save: async () => false, backendName: async () => null }
    const service = track(new Service({ budgetStore: budget, categoryStore: categories, recurrenceStore: track(new Recurrences()), transport: server.transport, passwords: passwords as never, stateStore }))
    await expect(service.savePassword(config, 'password')).resolves.toBe(false)
    service.resume()
    await service.syncNow()
    expect(server.transport).not.toHaveBeenCalled()
    service.dispose()
    stateStore.save({ config, baseline: {} })
    expect(stateStore.calendar.config).toEqual(config)
  })
  it('reports an incomplete configuration found on disk instead of syncing', async () => {
    writeJson(path.join(temp.dataDir, 'calendar.json'), { config: { enabled: true, calendarUrl: 'ftp://dav.test/cal', username: 'alice' }, baseline: {} })
    const server = fakeServer()
    const recurrences = track(new Recurrences())
    const budget = track(new Budget(recurrences))
    const service = track(new Service({ budgetStore: budget, categoryStore: track(new Categories()), recurrenceStore: track(new Recurrences()), transport: server.transport }))
    expect(service.config.enabled).toBe(true)
    await service.syncNow()
    expect(service.status).toMatchObject({ state: 'error', message: expect.stringContaining('Indiquez') })
    expect(server.transport).not.toHaveBeenCalled()
  })
})
