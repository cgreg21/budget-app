/*
 * ui/dialogs/category-combo.ts — the "Catégorie" row shared by the transaction
 * and recurrence forms.
 *
 * The row shows the icon of the selected category as a prefix, and the drop
 * down lists every category with its own icon — which is what a list item
 * factory is for.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import { DEFAULT_CATEGORY_ICON, FALLBACK_CATEGORY, type Category } from '../../domain/category.js'
import { t } from '../../i18n/index.js'
import type {
  AdwComboRow,
  GtkImage,
  GtkLabel,
  GtkListItem,
  GtkListItemFactory,
} from '../gtk-types.js'
import { setCategoryIcon } from '../icons.js'
import { onNotify } from '../widgets.js'

const ICON_SPACING = 12

export interface CategoryCombo {
  row: AdwComboRow
  /** The name of the selected category. */
  read(): string
}

/** Paints "icon + name" for every entry of the drop down. */
function createIconFactory(categories: readonly Category[]): GtkListItemFactory {
  const factory = new Gtk.SignalListItemFactory()

  factory.on('setup', (object) => {
    const item = object as unknown as GtkListItem
    const box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: ICON_SPACING })
    box.append(new Gtk.Image())
    box.append(new Gtk.Label({ xalign: 0 }))
    item.setChild(box)
  })

  factory.on('bind', (object) => {
    const item = object as unknown as GtkListItem
    const category = categories[item.position]
    if (!category) return

    const image = item.getChild()?.getFirstChild() as GtkImage | null
    const label = image?.getNextSibling() as GtkLabel | null
    if (image) setCategoryIcon(image, category.icon)
    if (label) label.label = category.name
  })

  return factory
}

export function createCategoryCombo(
  categories: readonly Category[],
  selectedName: string | undefined,
): CategoryCombo {
  const names = categories.map((category) => category.name)

  const row = new Adw.ComboRow({
    title: t().categoryCombo.title,
    model: Gtk.StringList.new(names),
    // Unknown or absent category (new transaction) falls back to the first one.
    selected: Math.max(0, names.indexOf(selectedName ?? '')),
  })
  row.setListFactory(createIconFactory(categories))

  const icon = new Gtk.Image({ valign: Gtk.Align.CENTER })
  row.addPrefix(icon)

  const showIcon = () => {
    setCategoryIcon(icon, categories[row.selected]?.icon ?? DEFAULT_CATEGORY_ICON)
  }
  onNotify(row, 'selected', showIcon)
  showIcon()

  return {
    row,
    read: () => names[row.selected] ?? FALLBACK_CATEGORY,
  }
}
