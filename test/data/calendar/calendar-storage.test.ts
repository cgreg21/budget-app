import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CALENDAR_CONFIG, type CalendarConfig } from 'budget-lib'
import { createTempUserDataDir, removeTempUserDataDir, writeJson, type TempDataDir } from '../../helpers/temp-data-dir.js'

const config: CalendarConfig = { enabled: true, calendarUrl: 'https://dav.test/cal', username: 'alice' }
let temp: TempDataDir
const opened: { dispose(): void }[] = []
beforeEach(() => {
  temp = createTempUserDataDir()
  vi.spyOn(fs, 'watch').mockImplementation(() => ({ close() {} }) as fs.FSWatcher)
})
afterEach(() => {
  for (const value of opened.splice(0)) value.dispose()
  vi.restoreAllMocks()
  removeTempUserDataDir(temp)
})

async function stateStore() {
  const { CalendarStateStore } = await import('../../../src/data/calendar/calendar-state-store.js')
  const store = new CalendarStateStore()
  opened.push(store)
  return store
}

describe('calendar local state', () => {
  it('defaults to disabled with no baseline', async () => {
    expect((await stateStore()).calendar).toEqual({ config: DEFAULT_CALENDAR_CONFIG, baseline: {} })
  })
  it.each([
    null, [], {}, { config: {}, baseline: {} },
    { config, baseline: [] }, { config, baseline: { t1: null } },
    { config, baseline: { t1: { href: 1, hash: 'x' } } },
    { config, baseline: { t1: { href: '/t1.ics', hash: 'x', etag: 42 } } },
    { config, baseline: {}, lastSync: 42 },
  ])('rejects malformed state %j', async (raw) => {
    writeJson(path.join(temp.dataDir, 'calendar.json'), raw)
    expect((await stateStore()).calendar).toEqual({ config: DEFAULT_CALENDAR_CONFIG, baseline: {} })
  })
  it('projects settings on load/save so extra secret fields cannot enter state', async () => {
    const extra = { ...config, username: ' alice ', calendarUrl: ' https://dav.test/cal/ ', password: 'sensitive' }
    writeJson(path.join(temp.dataDir, 'calendar.json'), { config: extra, baseline: { t1: { href: '/t1.ics', hash: 'hash', etag: 'v1' } }, lastSync: '2026-10-09T12:00:00Z' })
    const store = await stateStore()
    expect(store.calendar.config).toEqual(config)
    store.save({ ...store.calendar, config: extra })
    expect(fs.readFileSync(path.join(temp.dataDir, 'calendar.json'), 'utf8')).not.toContain('sensitive')
    expect(store.calendar.baseline.t1.etag).toBe('v1')
  })
})

describe('calendar secure password storage', () => {
  it('uses a separate keyring schema and normalized calendar/user attributes', async () => {
    const { CalendarPasswordStore } = await import('../../../src/data/calendar/calendar-password-store.js')
    const secret = {
      Schema: { new: vi.fn(() => 'calendar-schema') }, SchemaFlags: { NONE: 0 }, SchemaAttributeType: { STRING: 0 }, COLLECTION_DEFAULT: 'default',
      passwordLookupSync: vi.fn(() => 'password'), passwordStoreSync: vi.fn(() => true),
    }
    const store = new CalendarPasswordStore(async () => secret)
    const extra = { ...config, username: ' alice ', calendarUrl: ' https://dav.test/cal/ ' }
    await expect(store.load(extra)).resolves.toBe('password')
    expect(secret.Schema.new).toHaveBeenCalledWith('org.gtk.budget-app.Calendar', 0, { calendar: 0, username: 0 })
    expect(secret.passwordLookupSync).toHaveBeenCalledWith('calendar-schema', { calendar: config.calendarUrl, username: config.username }, null)
    await expect(store.save(extra, 'new-password')).resolves.toBe(true)
    expect(secret.passwordStoreSync).toHaveBeenCalledWith('calendar-schema', { calendar: config.calendarUrl, username: config.username }, 'default', 'Budget - CalDAV', 'new-password', null)
  })
  it('does not fall back to files or environment when the keyring is unavailable', async () => {
    const { CalendarPasswordStore } = await import('../../../src/data/calendar/calendar-password-store.js')
    const loader = vi.fn(async () => { throw new Error('Missing typelib') })
    const store = new CalendarPasswordStore(loader)
    await expect(store.load(config)).resolves.toBe('')
    await expect(store.save(config, 'password')).resolves.toBe(false)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(fs.existsSync(path.join(temp.dataDir, 'calendar.json'))).toBe(false)
  })
  it('propagates keyring access failures rather than claiming a password was saved', async () => {
    const { CalendarPasswordStore } = await import('../../../src/data/calendar/calendar-password-store.js')
    const secret = {
      Schema: { new: () => 'schema' }, SchemaFlags: { NONE: 0 }, SchemaAttributeType: { STRING: 0 }, COLLECTION_DEFAULT: 'default',
      passwordLookupSync: () => { throw new Error('Locked keyring') },
      passwordStoreSync: () => { throw new Error('Locked keyring') },
    }
    const store = new CalendarPasswordStore(async () => secret)
    await expect(store.load(config)).rejects.toThrow('Locked keyring')
    await expect(store.save(config, 'password')).rejects.toThrow('Locked keyring')
  })
})
