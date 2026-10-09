import {
  DEFAULT_CALENDAR_CONFIG,
  isCalendarConfig,
  normalizeCalendarConfig,
  type CalendarConfig,
  type SyncBaseline,
} from 'budget-lib'
import { JsonFileStore } from '../json-file-store.js'
import { CALENDAR_STATE_FILE } from '../paths.js'

export interface CalendarState {
  config: CalendarConfig
  baseline: SyncBaseline
  lastSync?: string
}

function isBaseline(value: unknown): value is SyncBaseline {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) return false
      return 'href' in entry && typeof entry.href === 'string'
        && 'hash' in entry && typeof entry.hash === 'string'
        && (!('etag' in entry) || entry.etag === undefined || typeof entry.etag === 'string')
    })
}

export class CalendarStateStore extends JsonFileStore<CalendarState> {
  constructor() { super(CALENDAR_STATE_FILE) }

  get calendar(): CalendarState { return this.state }

  save(state: CalendarState): void {
    // Explicit projection prevents accidental persistence of a password.
    this.commit({ config: normalizeCalendarConfig(state.config), baseline: state.baseline, lastSync: state.lastSync })
  }

  protected parse(raw: unknown): CalendarState | null {
    if (typeof raw !== 'object' || raw === null || !('config' in raw) || !('baseline' in raw)) return null
    if (!isCalendarConfig(raw.config) || !isBaseline(raw.baseline)) return null
    if ('lastSync' in raw && raw.lastSync !== undefined && typeof raw.lastSync !== 'string') return null
    return {
      config: normalizeCalendarConfig(raw.config), baseline: raw.baseline,
      lastSync: 'lastSync' in raw && typeof raw.lastSync === 'string' ? raw.lastSync : undefined,
    }
  }

  protected createDefault(): CalendarState {
    return { config: { ...DEFAULT_CALENDAR_CONFIG }, baseline: {} }
  }
}
