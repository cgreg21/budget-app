/*
 * ui/dialogs/file-dialogs.ts — picking a file to read from or write to.
 *
 * `Gtk.FileDialog` is asynchronous: it hands the answer to a callback, and
 * raises an error when the user simply closed it. That error is not a failure,
 * so it is swallowed here and the callback is only run on a real choice —
 * callers never have to think about cancellation.
 *
 * The parent has to be a window, while our callers live inside an
 * `Adw.Dialog`; the window is therefore looked up from the widget tree.
 */
import Gtk from 'gi:Gtk-4.0'
import Gio from 'gi:Gio-2.0'
import GObject from 'gi:GObject-2.0'

import type { GtkWidget, GtkWindow } from '../gtk-types.js'

export interface FileDialogOptions {
  title: string
  /** Name proposed when saving; also gives the file its extension. */
  initialName?: string
  /** Label of the file type filter, e.g. "Sauvegarde Budget (*.json)". */
  filterName: string
  patterns: readonly string[]
}

export type FileChosen = (filePath: string) => void

export function chooseFileToSave(
  parent: GtkWidget,
  options: FileDialogOptions,
  onChosen: FileChosen,
): void {
  const dialog = createDialog(options)
  dialog.save(windowOf(parent), null, (_source, result) => {
    const filePath = pathOf(() => dialog.saveFinish(result))
    if (filePath) onChosen(filePath)
  })
}

export function chooseFileToOpen(
  parent: GtkWidget,
  options: FileDialogOptions,
  onChosen: FileChosen,
): void {
  const dialog = createDialog(options)
  dialog.open(windowOf(parent), null, (_source, result) => {
    const filePath = pathOf(() => dialog.openFinish(result))
    if (filePath) onChosen(filePath)
  })
}

function createDialog({ title, initialName, filterName, patterns }: FileDialogOptions) {
  const dialog = new Gtk.FileDialog({ title, modal: true })
  if (initialName) dialog.setInitialName(initialName)

  const filter = new Gtk.FileFilter({ name: filterName })
  for (const pattern of patterns) filter.addPattern(pattern)

  // The filter list is a GListModel, which needs the GType of its items; the
  // filter above is created first so the type is registered by then.
  const filters = Gio.ListStore.new(GObject.typeFromName('GtkFileFilter'))
  filters.append(filter)
  dialog.setFilters(filters)
  dialog.setDefaultFilter(filter)

  return dialog
}

/** The window a widget belongs to — `Gtk.FileDialog` accepts nothing else. */
function windowOf(widget: GtkWidget): GtkWindow | null {
  return (widget.getRoot() as unknown as GtkWindow | null) ?? null
}

/** `null` when the dialog was dismissed, or when the file has no local path. */
function pathOf(finish: () => { getPath(): string | null } | null): string | null {
  try {
    return finish()?.getPath() ?? null
  } catch {
    return null // dismissed by the user
  }
}
