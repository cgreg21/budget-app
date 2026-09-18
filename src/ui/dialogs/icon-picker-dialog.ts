/*
 * ui/dialogs/icon-picker-dialog.ts — the grid of icons offered when picking
 * the icon of a category.
 *
 * Choosing is a single click: the dialog reports the icon and closes. The one
 * currently in use is highlighted, so reopening the picker always shows where
 * the category stands.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import type { GtkWidget } from '../gtk-types.js'
import { CATEGORY_ICON_CHOICES } from '../icons.js'

const DIALOG_WIDTH = 400
const DIALOG_HEIGHT = 420
const ICONS_PER_LINE = 6

export interface IconPickerOptions {
  /** The icon currently in use, highlighted in the grid. */
  selected: string
  onSelect(icon: string): void
}

export function openIconPickerDialog(
  parent: GtkWidget,
  { selected, onSelect }: IconPickerOptions,
): void {
  const dialog = new Adw.Dialog({
    title: 'Choisir une icône',
    contentWidth: DIALOG_WIDTH,
    contentHeight: DIALOG_HEIGHT,
  })

  const grid = new Gtk.FlowBox({
    selectionMode: Gtk.SelectionMode.NONE,
    homogeneous: true,
    minChildrenPerLine: ICONS_PER_LINE,
    maxChildrenPerLine: ICONS_PER_LINE,
    rowSpacing: 6,
    columnSpacing: 6,
    marginTop: 12,
    marginBottom: 12,
    marginStart: 12,
    marginEnd: 12,
  })

  for (const { name, label } of CATEGORY_ICON_CHOICES) {
    const button = new Gtk.Button({
      iconName: name,
      tooltipText: label,
      cssClasses: name === selected ? ['circular', 'suggested-action'] : ['flat', 'circular'],
    })
    button.on('clicked', () => {
      onSelect(name)
      dialog.close()
    })
    grid.append(button)
  }

  const scrolled = new Gtk.ScrolledWindow({
    vexpand: true,
    hscrollbarPolicy: Gtk.PolicyType.NEVER,
  })
  scrolled.setChild(grid)

  const header = new Adw.HeaderBar({ showStartTitleButtons: false, showEndTitleButtons: false })
  const cancelButton = new Gtk.Button({ label: 'Annuler' })
  cancelButton.on('clicked', () => dialog.close())
  header.packStart(cancelButton)

  const toolbar = new Adw.ToolbarView()
  toolbar.addTopBar(header)
  toolbar.setContent(scrolled)

  dialog.child = toolbar
  dialog.present(parent)
}
