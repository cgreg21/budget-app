import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_CATEGORIES, DEFAULT_CATEGORY_ICON } from '../../src/domain/category.js'
import {
  createTempUserDataDir,
  readJson,
  removeTempUserDataDir,
  writeJson,
  type TempDataDir,
} from '../helpers/temp-data-dir.js'

type StoreModule = typeof import('../../src/data/category-store.js')
type PathsModule = typeof import('../../src/data/paths.js')

let temp: TempDataDir
let CategoryStore: StoreModule['CategoryStore']
let categoriesFile: string
const opened: { dispose(): void }[] = []

/** Built after the temp directory exists, so it writes inside it. */
async function openStore() {
  const store = new CategoryStore()
  opened.push(store)
  return store
}

beforeEach(async () => {
  temp = createTempUserDataDir()
  ;({ CATEGORIES_FILE: categoriesFile } = (await import('../../src/data/paths.js')) as PathsModule)
  ;({ CategoryStore } = (await import('../../src/data/category-store.js')) as StoreModule)
})

afterEach(() => {
  for (const store of opened.splice(0)) store.dispose()
  removeTempUserDataDir(temp)
})

describe('loading', () => {
  it('starts from the default categories on a fresh install', async () => {
    const store = await openStore()
    expect(store.categories).toEqual(DEFAULT_CATEGORIES)
  })

  it('reads an existing file, keeping only the known fields', async () => {
    writeJson(categoriesFile, [{ name: 'Courses', icon: 'emoji-food-symbolic', extra: 1 }])
    const store = await openStore()

    expect(store.categories).toEqual([{ name: 'Courses', icon: 'emoji-food-symbolic' }])
  })

  it('upgrades a legacy list of plain names', async () => {
    writeJson(categoriesFile, ['Transport', 'Divers'])
    const store = await openStore()

    expect(store.categories).toEqual([
      { name: 'Transport', icon: 'emoji-travel-symbolic' },
      { name: 'Divers', icon: DEFAULT_CATEGORY_ICON },
    ])
  })

  it('falls back to the defaults when the file is invalid', async () => {
    writeJson(categoriesFile, { nope: true })
    const store = await openStore()

    expect(store.categories).toEqual(DEFAULT_CATEGORIES)
  })

  it('falls back to the defaults when the file holds an empty list', async () => {
    writeJson(categoriesFile, [])
    const store = await openStore()

    expect(store.categories).toEqual(DEFAULT_CATEGORIES)
  })
})

describe('add', () => {
  it('appends a category with the icon it was given', async () => {
    const store = await openStore()

    expect(store.add('Cadeaux', 'starred-symbolic')).toBe(true)
    expect(store.categories.at(-1)).toEqual({ name: 'Cadeaux', icon: 'starred-symbolic' })
  })

  it('uses the default icon when none is given', async () => {
    const store = await openStore()
    store.add('Cadeaux')

    expect(store.categories.at(-1)).toEqual({ name: 'Cadeaux', icon: DEFAULT_CATEGORY_ICON })
  })

  it('trims the name', async () => {
    const store = await openStore()
    store.add('  Cadeaux  ')

    expect(store.categories.at(-1)?.name).toBe('Cadeaux')
  })

  it('refuses a blank name', async () => {
    const store = await openStore()
    expect(store.add('   ')).toBe(false)
  })

  it('refuses a name already used', async () => {
    const store = await openStore()
    expect(store.add('Transport')).toBe(false)
  })

  it('persists the new category', async () => {
    const store = await openStore()
    store.add('Cadeaux', 'starred-symbolic')

    expect(readJson(categoriesFile)).toContainEqual({ name: 'Cadeaux', icon: 'starred-symbolic' })
  })
})

describe('rename', () => {
  it('renames in place, keeping the icon and the position', async () => {
    const store = await openStore()
    const index = store.categories.findIndex((category) => category.name === 'Transport')

    expect(store.rename('Transport', 'Déplacements')).toBe(true)
    expect(store.categories[index]).toEqual({
      name: 'Déplacements',
      icon: 'emoji-travel-symbolic',
    })
  })

  it('trims the new name', async () => {
    const store = await openStore()
    store.rename('Transport', '  Déplacements  ')

    expect(store.categories.some((category) => category.name === 'Déplacements')).toBe(true)
  })

  it('accepts renaming a category to the very same name', async () => {
    const store = await openStore()
    expect(store.rename('Transport', 'Transport')).toBe(true)
  })

  it('refuses a blank name', async () => {
    const store = await openStore()
    expect(store.rename('Transport', '  ')).toBe(false)
  })

  it('refuses an unknown category', async () => {
    const store = await openStore()
    expect(store.rename('Inconnue', 'Autre')).toBe(false)
  })

  it('refuses a name already used by another category', async () => {
    const store = await openStore()
    expect(store.rename('Transport', 'Logement')).toBe(false)
  })
})

describe('setIcon', () => {
  it('changes the icon, keeping the name', async () => {
    const store = await openStore()

    expect(store.setIcon('Transport', 'airplane-mode-symbolic')).toBe(true)
    expect(store.categories.find((category) => category.name === 'Transport')?.icon).toBe(
      'airplane-mode-symbolic',
    )
  })

  it('refuses an unknown category', async () => {
    const store = await openStore()
    expect(store.setIcon('Inconnue', 'starred-symbolic')).toBe(false)
  })

  it('refuses a blank icon', async () => {
    const store = await openStore()
    expect(store.setIcon('Transport', '')).toBe(false)
  })
})

describe('remove', () => {
  it('removes a known category', async () => {
    const store = await openStore()

    expect(store.remove('Transport')).toBe(true)
    expect(store.categories.some((category) => category.name === 'Transport')).toBe(false)
  })

  it('refuses an unknown category', async () => {
    const store = await openStore()
    expect(store.remove('Inconnue')).toBe(false)
  })

  it('refuses to remove the last remaining category', async () => {
    writeJson(categoriesFile, [{ name: 'Seule', icon: DEFAULT_CATEGORY_ICON }])
    const store = await openStore()

    expect(store.remove('Seule')).toBe(false)
    expect(store.categories).toHaveLength(1)
  })
})

describe('replaceAll', () => {
  it('swaps the whole list', async () => {
    const store = await openStore()
    const next = [{ name: 'A', icon: 'starred-symbolic' }, { name: 'B', icon: 'folder-symbolic' }]

    expect(store.replaceAll(next)).toBe(true)
    expect(store.categories).toEqual(next)
  })

  it('copies the entries instead of keeping the caller\u2019s objects', async () => {
    const store = await openStore()
    const source = [{ name: 'A', icon: 'starred-symbolic' }]
    store.replaceAll(source)
    source[0]!.name = 'muté'

    expect(store.categories[0]?.name).toBe('A')
  })

  it('refuses an empty list', async () => {
    const store = await openStore()
    expect(store.replaceAll([])).toBe(false)
    expect(store.categories).toEqual(DEFAULT_CATEGORIES)
  })
})
