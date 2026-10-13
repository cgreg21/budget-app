import { describe, expect, it, vi } from 'vitest'
import { CATEGORY_ICON_CHOICES, categoryIconFile, iconLabel, setCategoryIcon } from '../../src/ui/icons.js'
import { DEFAULT_CATEGORIES } from 'budget-lib'

/** A stand-in for a Gtk.Image recording what the helpers asked of it. */
function fakeImage() {
  return {
    addCssClass: vi.fn(),
    removeCssClass: vi.fn(),
    setFromFile: vi.fn(),
    setFromIconName: vi.fn(),
  }
}

describe('categoryIconFile', () => {
  it('resolves a bundled tabler icon to its SVG file', () => {
    const file = categoryIconFile('tabler:car')
    expect(file).toBeDefined()
    expect(file!.replace(/\\/g, '/')).toMatch(/\/assets\/icons\/categories\/car\.svg$/)
  })

  it('has no file for a GTK theme icon', () => {
    expect(categoryIconFile('folder-symbolic')).toBeUndefined()
  })
})

describe('setCategoryIcon', () => {
  it('loads a bundled SVG and marks the image', () => {
    const image = fakeImage()
    setCategoryIcon(image as never, 'tabler:bus')
    expect(image.addCssClass).toHaveBeenCalledWith('category-svg-icon')
    expect(image.setFromFile).toHaveBeenCalledWith(expect.stringMatching(/bus\.svg$/))
    expect(image.setFromIconName).not.toHaveBeenCalled()
  })

  it('falls back to the icon theme and clears the mark', () => {
    const image = fakeImage()
    setCategoryIcon(image as never, 'folder-symbolic')
    expect(image.removeCssClass).toHaveBeenCalledWith('category-svg-icon')
    expect(image.setFromIconName).toHaveBeenCalledWith('folder-symbolic')
    expect(image.setFromFile).not.toHaveBeenCalled()
  })
})

describe('CATEGORY_ICON_CHOICES', () => {
  it('is not empty', () => {
    expect(CATEGORY_ICON_CHOICES.length).toBeGreaterThan(0)
  })

  it('holds no duplicate icon name', () => {
    const names = CATEGORY_ICON_CHOICES.map((choice) => choice.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives every choice a non-empty name and translation key', () => {
    for (const choice of CATEGORY_ICON_CHOICES) {
      expect(choice.name).not.toBe('')
      expect(choice.key).not.toBe('')
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
