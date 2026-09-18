/*
 * data/remote/remote-config-store.ts — which server holds the budget, in
 * `remote.json`.
 *
 * Deliberately `localOnly`: it is the one file that must stay editable while
 * the server is unreachable — otherwise a typo in the address would lock the
 * application out of its own settings — and the one file that has no business
 * being uploaded anywhere.
 *
 * The password is not here, and cannot be: `RemoteConfig` has no field for it.
 * It lives in the system keyring (see credentials.ts).
 */
import {
  DEFAULT_REMOTE_CONFIG,
  isRemoteConfig,
  normalizeRemoteConfig,
  type RemoteConfig,
} from '../../domain/remote.js'
import { JsonFileStore } from '../json-file-store.js'
import { REMOTE_CONFIG_FILE } from '../paths.js'

export class RemoteConfigStore extends JsonFileStore<RemoteConfig> {
  constructor() {
    super(REMOTE_CONFIG_FILE, { localOnly: true })
  }

  get config(): RemoteConfig {
    return this.state
  }

  save(config: RemoteConfig): void {
    this.commit(config)
  }

  /** Back to plain local storage, keeping the address for the next attempt. */
  disable(): void {
    if (!this.state.enabled) return
    this.commit({ ...this.state, enabled: false })
  }

  protected parse(raw: unknown): RemoteConfig | null {
    return isRemoteConfig(raw) ? raw : null
  }

  protected createDefault(): RemoteConfig {
    return DEFAULT_REMOTE_CONFIG
  }

  protected override normalize(state: RemoteConfig): RemoteConfig {
    return normalizeRemoteConfig(state)
  }
}
