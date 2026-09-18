/*
 * Budget App — an Adwaita personal budget manager built with node-gtk.
 *
 * This file is only the bootstrap; everything else lives in layers:
 *   src/domain/ — the model and its rules (no GTK, no I/O)
 *   src/data/   — JSON-file backed observable stores
 *   src/ui/     — widgets, views and dialogs
 *   src/app/    — window composition and application lifecycle
 *
 * Namespaces are imported with the `gi:` scheme (`import Gtk from 'gi:Gtk-4.0'`)
 * and the app is run with `node --import node-gtk/register …` (see the
 * package.json scripts), which installs the loader hooks those imports need.
 *
 * `runApplication()` must stay the last statement: it ends with `app.run()`,
 * which returns immediately under ESM instead of blocking.
 */
import { runApplication } from './app/application.js'

runApplication({ stylesheet: new URL('../style.css', import.meta.url) })
