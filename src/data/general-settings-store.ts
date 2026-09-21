/* Persisted display preferences, kept local to this machine. */
import {
  DEFAULT_GENERAL_SETTINGS,
  isGeneralSettings,
  type GeneralSettings,
} from '../domain/general-settings.js'
import { JsonFileStore } from './json-file-store.js'
import { GENERAL_SETTINGS_FILE } from './paths.js'

export class GeneralSettingsStore extends JsonFileStore<GeneralSettings> {
  constructor() {
    super(GENERAL_SETTINGS_FILE, { localOnly: true })
  }

  get settings(): GeneralSettings {
    return this.state
  }

  save(settings: GeneralSettings): void {
    this.commit(settings)
  }

  protected parse(raw: unknown): GeneralSettings | null {
    return isGeneralSettings(raw) ? raw : null
  }

  protected createDefault(): GeneralSettings {
    return DEFAULT_GENERAL_SETTINGS
  }
}
