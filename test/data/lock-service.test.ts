import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createTempUserDataDir,
  readJson,
  removeTempUserDataDir,
  writeJson,
  type TempDataDir,
} from '../helpers/temp-data-dir.js'

type LockModule = typeof import('../../src/data/lock-service.js')
type PathsModule = typeof import('../../src/data/paths.js')

let temp: TempDataDir
let lock: LockModule
let lockFile: string
let now = 1_000_000
const opened: { dispose(): void }[] = []

// One live instance at a time: two watchers on the same file make Windows refuse renames.
const open = () => {
  for (const store of opened.splice(0)) store.dispose()
  const service = new lock.LockService(() => now)
  opened.push(service)
  return service
}

beforeEach(async () => {
  temp = createTempUserDataDir()
  now = 1_000_000
  lock = (await import('../../src/data/lock-service.js')) as LockModule
  ;({ LOCK_FILE: lockFile } = (await import('../../src/data/paths.js')) as PathsModule)
})

afterEach(() => {
  for (const store of opened.splice(0)) store.dispose()
  removeTempUserDataDir(temp)
})

describe('LockService', () => {
  it('is disabled and unlocked by default', async () => {
    const service = open()
    expect(service.enabled).toBe(false)
    expect(service.locked).toBe(false)
    expect(await service.unlock('1234')).toBe(true)
    expect(await service.verify('1234')).toBe(false)
    service.lock()
    expect(service.locked).toBe(false)
  })

  it('validates PIN shape', async () => {
    expect(lock.LockService.isValidPin('1234')).toBe(true)
    expect(lock.LockService.isValidPin('12345678')).toBe(true)
    expect(lock.LockService.isValidPin('123')).toBe(false)
    expect(lock.LockService.isValidPin('123456789')).toBe(false)
    expect(lock.LockService.isValidPin('12a4')).toBe(false)
    await expect(open().setPin('12')).rejects.toThrow()
  })

  it('stores a salted PBKDF2 hash, never the PIN', async () => {
    const service = open()
    await service.setPin('4321')
    const raw = JSON.stringify(readJson(lockFile))
    expect(raw).not.toContain('4321')
    const { record } = readJson(lockFile) as { record: { salt: string, hash: string, iterations: number } }
    expect(record.iterations).toBe(150_000)
    expect(record.salt).not.toBe('')

    await service.setPin('4321')
    const second = (readJson(lockFile) as { record: { salt: string } }).record
    expect(second.salt).not.toBe(record.salt)
  })

  it('starts locked once a PIN exists, and unlocks with the right one', async () => {
    await open().setPin('4321')
    const service = open()
    expect(service.enabled).toBe(true)
    expect(service.locked).toBe(true)
    let changes = 0
    service.onLockChange(() => { changes++ })
    expect(await service.unlock('0000')).toBe(false)
    expect(service.locked).toBe(true)
    expect(await service.unlock('4321')).toBe(true)
    expect(service.locked).toBe(false)
    expect(changes).toBe(1)
    service.lock()
    expect(service.locked).toBe(true)
    expect(await service.verify('4321')).toBe(true)
    expect(await service.verify('1111')).toBe(false)
  })

  it('throttles after five wrong attempts, doubling the delay', async () => {
    const service = open()
    await service.setPin('4321')
    service.lock()
    for (let attempt = 0; attempt < 4; attempt++) await service.unlock('0000')
    expect(service.blockedUntil).toBe(0)
    await service.unlock('0000')
    expect(service.blockedUntil).toBe(now + 30_000)
    expect(await service.unlock('4321')).toBe(false)

    now += 30_000
    expect(service.blockedUntil).toBe(0)
    await service.unlock('0000')
    expect(service.blockedUntil).toBe(now + 60_000)

    now += 60_000
    expect(await service.unlock('4321')).toBe(true)
    expect((readJson(lockFile) as { failures: number }).failures).toBe(0)
  })

  it('keeps the throttle across restarts', async () => {
    const service = open()
    await service.setPin('4321')
    for (let attempt = 0; attempt < 5; attempt++) await service.unlock('0000')
    expect(open().blockedUntil).toBe(now + 30_000)
  })

  it('locks again after 30 s of inactivity only', async () => {
    const service = open()
    await service.setPin('4321')
    await service.unlock('4321')

    service.markInactive()
    now += 29_000
    service.markActive()
    expect(service.locked).toBe(false)

    service.markInactive()
    service.markInactive()
    now += 30_000
    service.markActive()
    expect(service.locked).toBe(true)

    service.markActive()
    expect(service.locked).toBe(true)
  })

  it('ignores a malformed lock file', async () => {
    for (const bad of [null, 'x', { record: null, failures: 'a', until: 0 }, { record: { salt: 1 }, failures: 0, until: 0 }]) {
      writeJson(lockFile, bad)
      expect(open().enabled).toBe(false)
    }
    writeJson(lockFile, { record: { salt: 'c2FsdA==', hash: 'aGFzaA==', iterations: 1000 }, failures: 0, until: 0 })
    const service = open()
    expect(service.enabled).toBe(true)
    expect(await service.unlock('1234')).toBe(false)
  })

  it('stops notifying unsubscribed listeners', async () => {
    const service = open()
    await service.setPin('4321')
    let changes = 0
    const off = service.onLockChange(() => { changes++ })
    off()
    service.lock()
    expect(changes).toBe(0)
  })

  it('removes the PIN', async () => {
    const service = open()
    await service.setPin('4321')
    service.lock()
    let changes = 0
    service.onLockChange(() => { changes++ })
    service.disable()
    expect(service.enabled).toBe(false)
    expect(service.locked).toBe(false)
    expect(changes).toBe(1)
    expect(open().enabled).toBe(false)
  })
})
