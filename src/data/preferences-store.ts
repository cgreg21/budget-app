/*
 * data/preferences-store.ts — the remembered interface state, persisted to
 * `preferences.json`.
 *
 * Setters are no-ops when the value is unchanged: the widget that reports a
 * toggle is also the one listening for store changes, and skipping the
 * redundant write keeps that round trip from echoing.
 *
 * This file never leaves the machine: how the interface was left is a
 * property of this screen, not of the budget. Sharing it through the cloud
 * would just make two machines argue over an accordion.
 */
import {
  DEFAULT_PREFERENCES,
  isPreferences,
  type Preferences,
} from '../domain/preferences.js'
import { JsonFileStore } from './json-file-store.js'
import { PREFERENCES_FILE } from './paths.js'

export class PreferencesStore extends JsonFileStore<Preferences> {
  constructor() {
    super(PREFERENCES_FILE, { localOnly: true })
  }

  get preferences(): Preferences {
    return this.state
  }

  get chartsExpanded(): boolean {
    return this.state.chartsExpanded
  }

  setChartsExpanded(expanded: boolean): void {
    if (this.state.chartsExpanded === expanded) return
    this.commit({ ...this.state, chartsExpanded: expanded })
  }

  protected parse(raw: unknown): Preferences | null {
    // Keep only the known fields, so extra keys never reach the UI.
    return isPreferences(raw) ? { chartsExpanded: raw.chartsExpanded } : null
  }

  protected createDefault(): Preferences {
    return DEFAULT_PREFERENCES
  }
}
