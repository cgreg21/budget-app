/*
 * test/helpers/glib-stub.ts — stands in for `gi:GLib-2.0` under Vitest.
 *
 * `data/paths.ts` and `data/id.ts` are the only modules of the data layer that
 * touch GLib, and they only need two functions from it. Aliasing the namespace
 * to this stub (see vitest.config.ts) lets the stores run on plain Node, with
 * the data directory redirected to a throwaway folder.
 */
import { randomUUID } from 'node:crypto'
import os from 'node:os'

/** Set by `createTempUserDataDir()` so each test file gets its own data dir. */
export const USER_DATA_DIR_ENV = 'BUDGET_APP_TEST_USER_DATA_DIR'

const GLib = {
  getUserDataDir(): string {
    return process.env[USER_DATA_DIR_ENV] ?? os.tmpdir()
  },
  uuidStringRandom(): string {
    return randomUUID()
  },
}

export default GLib
