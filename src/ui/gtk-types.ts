/*
 * ui/gtk-types.ts — instance-type aliases for the GI classes used in the app.
 *
 * `import Gtk from 'gi:Gtk-4.0'` yields a *value* of type
 * `typeof import('Gtk-4.0.js')`, so dotted names such as `Gtk.Widget` cannot
 * be used in type position (TypeScript needs a namespace or class binding for
 * that, not a plain object). `InstanceType<typeof X>` recovers the instance
 * type of a class value; the aliases below are re-exported so the rest of the
 * app can simply write `GtkWidget`, `AdwActionRow`, …
 */
import Gtk from 'gi:Gtk-4.0'
import Gio from 'gi:Gio-2.0'
import Adw from 'gi:Adw-1'

export type GioMenu = InstanceType<typeof Gio.Menu>

export type GtkWidget = InstanceType<typeof Gtk.Widget>
export type GtkWindow = InstanceType<typeof Gtk.Window>
export type GtkAdjustment = InstanceType<typeof Gtk.Adjustment>
export type GtkBox = InstanceType<typeof Gtk.Box>
export type GtkButton = InstanceType<typeof Gtk.Button>
export type GtkCheckButton = InstanceType<typeof Gtk.CheckButton>
export type GtkImage = InstanceType<typeof Gtk.Image>
export type GtkLabel = InstanceType<typeof Gtk.Label>
export type GtkListBox = InstanceType<typeof Gtk.ListBox>
export type GtkListItem = InstanceType<typeof Gtk.ListItem>
export type GtkListItemFactory = InstanceType<typeof Gtk.SignalListItemFactory>

export type AdwApplication = InstanceType<typeof Adw.Application>
export type AdwApplicationWindow = InstanceType<typeof Adw.ApplicationWindow>
export type AdwActionRow = InstanceType<typeof Adw.ActionRow>
export type AdwBanner = InstanceType<typeof Adw.Banner>
export type AdwComboRow = InstanceType<typeof Adw.ComboRow>
export type AdwEntryRow = InstanceType<typeof Adw.EntryRow>
export type AdwHeaderBar = InstanceType<typeof Adw.HeaderBar>
export type AdwPasswordEntryRow = InstanceType<typeof Adw.PasswordEntryRow>
export type AdwPreferencesGroup = InstanceType<typeof Adw.PreferencesGroup>
export type AdwSpinRow = InstanceType<typeof Adw.SpinRow>
export type AdwSwitchRow = InstanceType<typeof Adw.SwitchRow>
