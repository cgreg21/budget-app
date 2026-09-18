/*
 * ui/dialogs/categories-group.ts — the category sections of the options
 * dialog: add on top, then one row per existing category with its icon,
 * inline rename (Enter or the apply button) and delete.
 *
 * The icon button on the left of a row opens the picker; the "new category"
 * row has one too, so an icon can be chosen before the category exists.
 *
 * Every change goes through the CategoryStore, which persists it to
 * `categories.json`.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import type { CategoryStore } from '../../data/category-store.js'
import { DEFAULT_CATEGORY_ICON, type Category } from '../../domain/category.js'
import type { AdwEntryRow, AdwPreferencesGroup, GtkButton, GtkWidget } from '../gtk-types.js'
import { iconLabel } from '../icons.js'
import type { Notify } from '../types.js'
import { createRowActionButton } from '../widgets.js'
import { createWriteGuard } from '../write-guard.js'
import { openConfirmDeleteDialog } from './confirm-delete-dialog.js'
import { openIconPickerDialog } from './icon-picker-dialog.js'

export interface CategoriesGroupsOptions {
  store: CategoryStore
  /** Widget the icon picker is presented on top of. */
  parent: GtkWidget
  notify: Notify
}

export interface CategoriesGroups {
  groups: AdwPreferencesGroup[]
  /** Releases the store subscription. */
  dispose(): void
}

function iconTooltip(icon: string): string {
  return `Icône : ${iconLabel(icon)} — cliquer pour changer`
}

/** The icon of a row, as a button opening the picker. */
function createIconButton(
  icon: string,
  parent: GtkWidget,
  onPick: (icon: string) => void,
): GtkButton {
  const button = new Gtk.Button({
    iconName: icon,
    tooltipText: iconTooltip(icon),
    cssClasses: ['flat', 'circular'],
    valign: Gtk.Align.CENTER,
  })

  button.on('clicked', () => openIconPickerDialog(parent, {
    selected: button.iconName,
    onSelect: (next) => {
      button.iconName = next
      button.setTooltipText(iconTooltip(next))
      onPick(next)
    },
  }))

  return button
}

function createAddGroup(
  store: CategoryStore,
  parent: GtkWidget,
  notify: Notify,
): AdwPreferencesGroup {
  const group = new Adw.PreferencesGroup({ title: 'Nouvelle catégorie' })
  const entry = new Adw.EntryRow({ title: 'Nom' })

  let icon = DEFAULT_CATEGORY_ICON
  const iconButton = createIconButton(icon, parent, (next) => { icon = next })
  entry.addPrefix(iconButton)

  const submit = () => {
    const name = entry.text.trim()
    if (!name) return

    createWriteGuard(notify)(() => {
      if (!store.add(name, icon)) {
        notify(`La catégorie « ${name} » existe déjà`)
        return
      }

      entry.text = ''
      icon = DEFAULT_CATEGORY_ICON
      iconButton.iconName = icon
      iconButton.setTooltipText(iconTooltip(icon))
      notify('Catégorie ajoutée')
    })
  }

  entry.addSuffix(createRowActionButton({
    iconName: 'list-add-symbolic',
    tooltip: 'Ajouter',
    onClick: submit,
  }))
  entry.on('apply', submit) // also fires when pressing Enter

  group.add(entry)
  return group
}

function createCategoryRow(
  { name, icon }: Category,
  store: CategoryStore,
  parent: GtkWidget,
  notify: Notify,
): AdwEntryRow {
  const row = new Adw.EntryRow({ title: 'Nom', text: name, showApplyButton: true })
  const guard = createWriteGuard(notify)

  row.addPrefix(createIconButton(icon, parent, (next) => guard(() => {
    if (store.setIcon(name, next)) notify('Icône modifiée')
  })))

  row.on('apply', () => guard(() => {
    const newName = row.text.trim()
    if (newName === name) return
    if (!newName || !store.rename(name, newName)) {
      if (newName) notify(`La catégorie « ${newName} » existe déjà`)
      row.text = name // revert: the store refused the change
      return
    }
    notify('Catégorie renommée')
  }))

  row.addSuffix(createRowActionButton({
    iconName: 'user-trash-symbolic',
    tooltip: 'Supprimer cette catégorie',
    onClick: () => {
      // Asked before the dialog rather than after: there is no point making
      // someone confirm a deletion the store is going to refuse anyway.
      if (store.categories.length <= 1) {
        notify('Il faut conserver au moins une catégorie')
        return
      }

      openConfirmDeleteDialog(parent, {
        name,
        body: 'Les transactions déjà enregistrées gardent cette catégorie : '
          + 'seule la liste proposée à la saisie change.',
        onConfirm: () => guard(() => {
          if (store.remove(name)) notify('Catégorie supprimée')
          else notify('Il faut conserver au moins une catégorie')
        }),
      })
    },
  }))

  return row
}

export function createCategoriesGroups({
  store,
  parent,
  notify,
}: CategoriesGroupsOptions): CategoriesGroups {
  const listGroup = new Adw.PreferencesGroup({ title: 'Catégories existantes' })
  let rows: AdwEntryRow[] = []

  const renderList = () => {
    for (const row of rows) listGroup.remove(row)
    rows = store.categories.map((category) => createCategoryRow(category, store, parent, notify))
    for (const row of rows) listGroup.add(row)
  }

  renderList()
  const unsubscribe = store.onChange(renderList)

  return {
    groups: [createAddGroup(store, parent, notify), listGroup],
    dispose: unsubscribe,
  }
}
