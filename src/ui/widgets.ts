/*
 * ui/widgets.ts — tiny builders for the widget patterns repeated across views.
 */
import Gtk from 'gi:Gtk-4.0'

import type { GtkBox, GtkButton, GtkListBox } from './gtk-types.js'

/** Marks the recurrences tab of the options dialog. */
export const RECURRING_ICON = 'media-playlist-repeat-symbolic'

export interface IconButtonOptions {
  iconName: string
  tooltip: string
  onClick: () => void
}

/** A plain icon button, e.g. for the header bar. */
export function createIconButton({ iconName, tooltip, onClick }: IconButtonOptions): GtkButton {
  const button = new Gtk.Button({ iconName, tooltipText: tooltip })
  button.on('clicked', onClick)
  return button
}

/** A flat circular icon button, meant for the suffix area of a list row. */
export function createRowActionButton({ iconName, tooltip, onClick }: IconButtonOptions): GtkButton {
  const button = new Gtk.Button({
    iconName,
    tooltipText: tooltip,
    cssClasses: ['flat', 'circular'],
    valign: Gtk.Align.CENTER,
  })
  button.on('clicked', onClick)
  return button
}

/**
 * Subscribes to a property change. The GI typings only list a widget's own
 * signals, so the detailed `notify::…` form goes through the generic signature
 * every GObject carries.
 */
export function onNotify(widget: object, property: string, callback: () => void): void {
  const object = widget as { on(signal: string, callback: () => void): unknown }
  object.on(`notify::${property}`, callback)
}

export function clearBox(box: GtkBox): void {
  let child = box.getFirstChild()
  while (child) {
    const next = child.getNextSibling()
    box.remove(child)
    child = next
  }
}

export function clearListBox(listBox: GtkListBox): void {
  let row = listBox.getRowAtIndex(0)
  while (row) {
    listBox.remove(row)
    row = listBox.getRowAtIndex(0)
  }
}
