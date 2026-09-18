/*
 * ui/dialogs/about-dialog.ts — the "About Budget App" window shown from the
 * main menu.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import {
  APP_DESCRIPTION,
  APP_ID,
  APP_NAME,
  APP_VERSION,
  COPYRIGHT,
  DEVELOPERS,
  DEVELOPER_NAME,
} from '../../app/app-info.js'
import type { GtkWindow } from '../gtk-types.js'

export function openAboutDialog(parent: GtkWindow): void {
  const about = new Adw.AboutWindow({
    transientFor: parent,
    applicationName: APP_NAME,
    applicationIcon: APP_ID,
    developerName: DEVELOPER_NAME,
    version: APP_VERSION,
    comments: APP_DESCRIPTION,
    developers: [...DEVELOPERS],
    copyright: COPYRIGHT,
    licenseType: Gtk.License.MIT_X11,
  })
  about.present()
}
