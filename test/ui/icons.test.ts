import { describe, expect, it } from 'vitest'
import { CATEGORY_ICON_CHOICES, iconLabel } from '../../src/ui/icons.js'
import { DEFAULT_CATEGORIES } from '../../src/domain/category.js'

describe('CATEGORY_ICON_CHOICES', () => {
  it('is not empty', () => {
    expect(CATEGORY_ICON_CHOICES.length).toBeGreaterThan(0)
  })

  it('holds no duplicate icon name', () => {
    const names = CATEGORY_ICON_CHOICES.map((choice) => choice.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives every choice a non-empty name and label', () => {
    for (const choice of CATEGORY_ICON_CHOICES) {
      expect(choice.name).not.toBe('')
      expect(choice.label).not.toBe('')
    }
  })

  it('offers the icon of every default category', () => {
    const names = new Set(CATEGORY_ICON_CHOICES.map((choice) => choice.name))
    for (const category of DEFAULT_CATEGORIES) {
      expect(names.has(category.icon)).toBe(true)
    }
  })
})

describe('iconLabel', () => {
  it('returns the label of a known icon', () => {
    expect(iconLabel('folder-symbolic')).toBe('Autres')
  })

  it('falls back to the icon name when it is unknown', () => {
    expect(iconLabel('inconnu-symbolic')).toBe('inconnu-symbolic')
  })
})
