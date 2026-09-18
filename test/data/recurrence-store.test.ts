import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Recurrence, RecurrenceInput } from '../../src/domain/recurrence.js'
import {
  createTempUserDataDir,
  readJson,
  removeTempUserDataDir,
  writeJson,
  type TempDataDir,
} from '../helpers/temp-data-dir.js'

type StoreModule = typeof import('../../src/data/recurrence-store.js')
type PathsModule = typeof import('../../src/data/paths.js')

let temp: TempDataDir
let RecurrenceStore: StoreModule['RecurrenceStore']
let recurrencesFile: string
const opened: { dispose(): void }[] = []

const input = (overrides: Partial<RecurrenceInput> = {}): RecurrenceInput => ({
  description: 'Loyer',
  category: 'Logement',
  kind: 'expense',
  amount: 800,
  day: 1,
  frequency: 'monthly',
  startMonth: '2026-01',
  ...overrides,
})

const recurrence = (overrides: Partial<Recurrence> = {}): Recurrence => ({
  id: 'r1',
  ...input(),
  ...overrides,
})

function openStore() {
  const store = new RecurrenceStore()
  opened.push(store)
  return store
}

beforeEach(async () => {
  temp = createTempUserDataDir()
  ;({ RECURRENCES_FILE: recurrencesFile } = (await import('../../src/data/paths.js')) as PathsModule)
  ;({ RecurrenceStore } = (await import('../../src/data/recurrence-store.js')) as StoreModule)
})

afterEach(() => {
  for (const store of opened.splice(0)) store.dispose()
  removeTempUserDataDir(temp)
})

describe('loading', () => {
  it('starts empty', () => {
    expect(openStore().recurrences).toEqual([])
  })

  it('reads stored recurrences, sorted by description', () => {
    writeJson(recurrencesFile, [
      recurrence({ id: 'a', description: 'Loyer' }),
      recurrence({ id: 'b', description: 'Assurance' }),
    ])

    expect(openStore().recurrences.map((r) => r.description)).toEqual(['Assurance', 'Loyer'])
  })

  it('starts empty when the file is invalid', () => {
    writeJson(recurrencesFile, [{ nope: true }])
    expect(openStore().recurrences).toEqual([])
  })
})

describe('add', () => {
  it('assigns an id', () => {
    const store = openStore()
    store.add(input())

    expect(store.recurrences).toHaveLength(1)
    expect(store.recurrences[0]?.id).toBeTypeOf('string')
  })

  it('persists the recurrence', () => {
    const store = openStore()
    store.add(input())

    expect(readJson(recurrencesFile)).toHaveLength(1)
  })

  it('keeps the list sorted', () => {
    const store = openStore()
    store.add(input({ description: 'Loyer' }))
    store.add(input({ description: 'Assurance' }))

    expect(store.recurrences.map((r) => r.description)).toEqual(['Assurance', 'Loyer'])
  })
})

describe('insert', () => {
  it('adds a recurrence whose id the caller already knows', () => {
    const store = openStore()
    store.insert(recurrence({ id: 'connu' }))

    expect(store.recurrences[0]?.id).toBe('connu')
  })
})

describe('find', () => {
  it('finds a recurrence by id', () => {
    const store = openStore()
    store.insert(recurrence({ id: 'r1' }))

    expect(store.find('r1')?.id).toBe('r1')
  })

  it('returns undefined for an unknown id', () => {
    expect(openStore().find('inconnu')).toBeUndefined()
  })

  it('returns undefined when no id is given', () => {
    expect(openStore().find(undefined)).toBeUndefined()
  })
})

describe('recurrencesFor', () => {
  it('returns only the recurrences due in a month', () => {
    const store = openStore()
    store.insert(recurrence({ id: 'a', startMonth: '2026-01' }))
    store.insert(recurrence({ id: 'b', description: 'Impôts', startMonth: '2026-05' }))

    expect(store.recurrencesFor('2026-03').map((r) => r.id)).toEqual(['a'])
  })
})

describe('update', () => {
  it('replaces the fields while keeping the id', () => {
    const store = openStore()
    store.insert(recurrence({ id: 'r1' }))

    store.update('r1', input({ amount: 950 }))

    expect(store.recurrences[0]).toMatchObject({ id: 'r1', amount: 950 })
  })

  it('ignores an unknown id', () => {
    const store = openStore()
    store.insert(recurrence({ id: 'r1' }))

    store.update('inconnu', input({ amount: 950 }))

    expect(store.recurrences[0]?.amount).toBe(800)
  })

  it('leaves the other recurrences alone', () => {
    const store = openStore()
    store.insert(recurrence({ id: 'r1', description: 'Loyer' }))
    store.insert(recurrence({ id: 'r2', description: 'Assurance' }))

    store.update('r1', input({ description: 'Loyer', amount: 950 }))

    expect(store.find('r2')?.amount).toBe(800)
  })
})

describe('remove', () => {
  it('forgets the template', () => {
    const store = openStore()
    store.insert(recurrence({ id: 'r1' }))

    store.remove('r1')

    expect(store.recurrences).toEqual([])
  })

  it('ignores an unknown id', () => {
    const store = openStore()
    store.insert(recurrence({ id: 'r1' }))

    store.remove('inconnu')

    expect(store.recurrences).toHaveLength(1)
  })
})

describe('replaceAll', () => {
  it('swaps the whole list', () => {
    const store = openStore()
    store.insert(recurrence({ id: 'r1' }))

    store.replaceAll([recurrence({ id: 'r2', description: 'Salaire', kind: 'income' })])

    expect(store.recurrences.map((r) => r.id)).toEqual(['r2'])
  })

  it('accepts an empty list', () => {
    const store = openStore()
    store.insert(recurrence({ id: 'r1' }))

    store.replaceAll([])

    expect(store.recurrences).toEqual([])
  })

  it('copies the entries instead of keeping the caller\u2019s objects', () => {
    const store = openStore()
    const source = [recurrence({ id: 'r1' })]
    store.replaceAll(source)
    source[0]!.amount = 1

    expect(store.recurrences[0]?.amount).toBe(800)
  })
})
