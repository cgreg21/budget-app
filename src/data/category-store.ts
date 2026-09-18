/*
 * data/category-store.ts — the categories (name + icon), persisted to
 * `categories.json`.
 *
 * The list is never allowed to become empty: an empty file would be rejected
 * on the next load and silently replaced by the defaults, which would be
 * surprising. `remove()` therefore refuses to delete the last category.
 *
 * Files written before icons existed hold a plain list of names; they are
 * upgraded on load and rewritten in the new shape at the first change.
 */
import {
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORY_ICON,
  fromLegacyCategories,
  isCategoryList,
  isLegacyCategoryList,
  normalizeCategoryName,
  type Category,
} from '../domain/category.js'
import { JsonFileStore } from './json-file-store.js'
import { CATEGORIES_FILE } from './paths.js'

export class CategoryStore extends JsonFileStore<Category[]> {
  constructor() {
    super(CATEGORIES_FILE)
  }

  get categories(): readonly Category[] {
    return this.state
  }

  /** Add a category. Returns false if the name is blank or already used. */
  add(name: string, icon: string = DEFAULT_CATEGORY_ICON): boolean {
    const category = normalizeCategoryName(name)
    if (!category || this.#has(category)) return false
    this.commit([...this.state, { name: category, icon }])
    return true
  }

  /** Rename a category in place. Returns false if the new name is blank or already used. */
  rename(currentName: string, newName: string): boolean {
    const name = normalizeCategoryName(newName)
    const index = this.#indexOf(currentName)
    if (!name || index === -1) return false
    if (name !== currentName && this.#has(name)) return false

    return this.#replace(index, { name })
  }

  /** Change the icon of a category. Returns false if the category is unknown. */
  setIcon(name: string, icon: string): boolean {
    const index = this.#indexOf(name)
    if (index === -1 || !icon) return false

    return this.#replace(index, { icon })
  }

  /** Remove a category. Returns false if it is unknown or is the last remaining one. */
  remove(name: string): boolean {
    if (this.state.length <= 1 || !this.#has(name)) return false
    this.commit(this.state.filter((category) => category.name !== name))
    return true
  }

  /** Swaps the whole list, e.g. when a backup is restored. Refuses an empty one. */
  replaceAll(categories: readonly Category[]): boolean {
    if (categories.length === 0) return false
    this.commit(categories.map(({ name, icon }) => ({ name, icon })))
    return true
  }

  protected parse(raw: unknown): Category[] | null {
    if (isCategoryList(raw)) return raw.map(({ name, icon }) => ({ name, icon }))
    return isLegacyCategoryList(raw) ? fromLegacyCategories(raw) : null
  }

  protected createDefault(): Category[] {
    return DEFAULT_CATEGORIES.map((category) => ({ ...category }))
  }

  #indexOf(name: string): number {
    return this.state.findIndex((category) => category.name === name)
  }

  #has(name: string): boolean {
    return this.#indexOf(name) !== -1
  }

  #replace(index: number, changes: Partial<Category>): boolean {
    const current = this.state[index]
    const next = [...this.state]
    next[index] = { ...current, ...changes }
    this.commit(next)
    return true
  }
}
