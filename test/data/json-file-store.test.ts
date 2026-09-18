/*
 * Exercises the persistence machinery shared by every store through a small
 * concrete subclass. The filesystem watcher is driven by hand — `fs.watch` is
 * stubbed so the callback can be invoked directly — which keeps the debounce
 * and reload paths deterministic instead of waiting on OS events.
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { JsonFileStore } from '../../src/data/json-file-store.js'
import { createTempUserDataDir, removeTempUserDataDir, writeJson, type TempDataDir } from '../helpers/temp-data-dir.js'

interface Box {
  value: number
}

// Module scope, not an instance field: `createDefault()` is called from the
// base constructor, before subclass fields are initialised.
let defaultValue: Box = { value: 0 }

class TestStore extends JsonFileStore<Box> {
  get current(): Box {
    return this.state
  }

  set(next: Box): void {
    this.commit(next)
  }

  protected parse(raw: unknown): Box | null {
    if (typeof raw !== 'object' || raw === null) return null
    const { value } = raw as Partial<Box>
    return typeof value === 'number' ? { value } : null
  }

  protected createDefault(): Box {
    return { ...defaultValue }
  }
}

/** Shows that `normalize()` runs on load, on commit and on external reload. */
class RoundingStore extends TestStore {
  protected override normalize(state: Box): Box {
    return { value: Math.round(state.value) }
  }
}

type WatchListener = (eventType: string, fileName: string | null) => void

let temp: TempDataDir
let filePath: string
let watchListener: WatchListener | undefined
const closeWatcher = vi.fn()

function stubWatcher(): void {
  watchListener = undefined
  vi.spyOn(fs, 'watch').mockImplementation(((_directory: unknown, callback: WatchListener) => {
    watchListener = callback
    return { close: closeWatcher } as unknown as fs.FSWatcher
  }) as unknown as typeof fs.watch)
}

/** Delivers a filesystem event and lets the debounce elapse. */
function emitChange(fileName: string | null): void {
  watchListener?.('change', fileName)
  vi.advanceTimersByTime(200)
}

beforeEach(() => {
  temp = createTempUserDataDir()
  filePath = path.join(temp.dataDir, 'box.json')
  defaultValue = { value: 0 }
  closeWatcher.mockClear()
  vi.useFakeTimers()
  stubWatcher()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  removeTempUserDataDir(temp)
})

describe('loading', () => {
  it('falls back to the default when the file does not exist', () => {
    defaultValue = { value: 7 }
    const store = new TestStore(filePath)

    expect(store.current).toEqual({ value: 7 })
    store.dispose()
  })

  it('reads an existing file', () => {
    writeJson(filePath, { value: 42 })
    const store = new TestStore(filePath)

    expect(store.current).toEqual({ value: 42 })
    store.dispose()
  })

  it('falls back to the default when the JSON is malformed', () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, '{ not json', 'utf-8')
    const store = new TestStore(filePath)

    expect(store.current).toEqual({ value: 0 })
    store.dispose()
  })

  it('falls back to the default when the contents are rejected by parse', () => {
    writeJson(filePath, { value: 'not a number' })
    const store = new TestStore(filePath)

    expect(store.current).toEqual({ value: 0 })
    store.dispose()
  })

  it('normalizes the state it loads', () => {
    writeJson(filePath, { value: 4.6 })
    const store = new RoundingStore(filePath)

    expect(store.current).toEqual({ value: 5 })
    store.dispose()
  })
})

describe('commit', () => {
  it('writes the new state to disk and keeps it in memory', () => {
    const store = new TestStore(filePath)
    store.set({ value: 10 })

    expect(store.current).toEqual({ value: 10 })
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual({ value: 10 })
    store.dispose()
  })

  it('creates the containing directory when it is missing', () => {
    const nested = path.join(temp.dataDir, 'deeply', 'nested', 'box.json')
    const store = new TestStore(nested)
    store.set({ value: 1 })

    expect(fs.existsSync(nested)).toBe(true)
    store.dispose()
  })

  it('normalizes the state before storing it', () => {
    const store = new RoundingStore(filePath)
    store.set({ value: 2.4 })

    expect(store.current).toEqual({ value: 2 })
    store.dispose()
  })

  it('notifies subscribers', () => {
    const store = new TestStore(filePath)
    const listener = vi.fn()
    store.onChange(listener)

    store.set({ value: 3 })

    expect(listener).toHaveBeenCalledTimes(1)
    store.dispose()
  })
})

describe('onChange', () => {
  it('stops notifying after the returned function is called', () => {
    const store = new TestStore(filePath)
    const listener = vi.fn()
    const unsubscribe = store.onChange(listener)

    unsubscribe()
    store.set({ value: 1 })

    expect(listener).not.toHaveBeenCalled()
    store.dispose()
  })

  it('tolerates a listener unsubscribing while subscribers are notified', () => {
    const store = new TestStore(filePath)
    const second = vi.fn()
    const unsubscribeFirst = store.onChange(() => unsubscribeFirst())
    store.onChange(second)

    expect(() => store.set({ value: 1 })).not.toThrow()
    expect(second).toHaveBeenCalledTimes(1)
    store.dispose()
  })
})

describe('external changes', () => {
  it('reloads and notifies when the file changes on disk', () => {
    const store = new TestStore(filePath)
    const listener = vi.fn()
    store.onChange(listener)

    writeJson(filePath, { value: 99 })
    emitChange('box.json')

    expect(store.current).toEqual({ value: 99 })
    expect(listener).toHaveBeenCalledTimes(1)
    store.dispose()
  })

  it('reloads when the watcher reports no file name', () => {
    const store = new TestStore(filePath)
    writeJson(filePath, { value: 5 })
    emitChange(null)

    expect(store.current).toEqual({ value: 5 })
    store.dispose()
  })

  it('normalizes what it reloads', () => {
    const store = new RoundingStore(filePath)
    writeJson(filePath, { value: 8.7 })
    emitChange('box.json')

    expect(store.current).toEqual({ value: 9 })
    store.dispose()
  })

  it('ignores a change to another file in the directory', () => {
    const store = new TestStore(filePath)
    const listener = vi.fn()
    store.onChange(listener)

    writeJson(filePath, { value: 99 })
    emitChange('other.json')

    expect(store.current).toEqual({ value: 0 })
    expect(listener).not.toHaveBeenCalled()
    store.dispose()
  })

  it('ignores the store\u2019s own write', () => {
    const store = new TestStore(filePath)
    store.set({ value: 4 })

    const listener = vi.fn()
    store.onChange(listener)
    emitChange('box.json')

    expect(listener).not.toHaveBeenCalled()
    store.dispose()
  })

  it('ignores a file that has disappeared', () => {
    const store = new TestStore(filePath)
    store.set({ value: 4 })

    const listener = vi.fn()
    store.onChange(listener)
    fs.rmSync(filePath)
    emitChange('box.json')

    expect(store.current).toEqual({ value: 4 })
    expect(listener).not.toHaveBeenCalled()
    store.dispose()
  })

  it('ignores a partially written file', () => {
    const store = new TestStore(filePath)
    const listener = vi.fn()
    store.onChange(listener)

    fs.writeFileSync(filePath, '{ "value":', 'utf-8')
    emitChange('box.json')

    expect(store.current).toEqual({ value: 0 })
    expect(listener).not.toHaveBeenCalled()
    store.dispose()
  })

  it('ignores contents its parse rejects', () => {
    const store = new TestStore(filePath)
    const listener = vi.fn()
    store.onChange(listener)

    writeJson(filePath, { value: 'nope' })
    emitChange('box.json')

    expect(store.current).toEqual({ value: 0 })
    expect(listener).not.toHaveBeenCalled()
    store.dispose()
  })

  it('debounces a burst of events into a single reload', () => {
    const store = new TestStore(filePath)
    const listener = vi.fn()
    store.onChange(listener)

    writeJson(filePath, { value: 11 })
    watchListener?.('change', 'box.json')
    watchListener?.('change', 'box.json')
    watchListener?.('change', 'box.json')
    vi.advanceTimersByTime(200)

    expect(listener).toHaveBeenCalledTimes(1)
    store.dispose()
  })

  it('keeps working when the filesystem cannot be watched', () => {
    vi.spyOn(fs, 'watch').mockImplementation((() => {
      throw new Error('watching unavailable')
    }) as unknown as typeof fs.watch)

    const store = new TestStore(filePath)
    expect(() => store.set({ value: 2 })).not.toThrow()
    expect(store.current).toEqual({ value: 2 })
    store.dispose()
  })
})

describe('dispose', () => {
  it('closes the watcher and drops the subscribers', () => {
    const store = new TestStore(filePath)
    const listener = vi.fn()
    store.onChange(listener)

    store.dispose()
    writeJson(filePath, { value: 1 })
    emitChange('box.json')

    expect(closeWatcher).toHaveBeenCalledTimes(1)
    expect(listener).not.toHaveBeenCalled()
  })

  it('cancels a reload that was still pending', () => {
    const store = new TestStore(filePath)
    const listener = vi.fn()
    store.onChange(listener)

    writeJson(filePath, { value: 1 })
    watchListener?.('change', 'box.json')
    store.dispose()
    vi.advanceTimersByTime(200)

    expect(listener).not.toHaveBeenCalled()
  })

  it('can be called twice', () => {
    const store = new TestStore(filePath)
    store.dispose()

    expect(() => store.dispose()).not.toThrow()
  })
})
