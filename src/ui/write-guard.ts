/*
 * ui/write-guard.ts — turning a refused write into a toast.
 *
 * When the budget lives on a server, the stores refuse to write while that
 * server is unreachable: they throw rather than let the cache drift away from
 * the reference. That happens inside GTK signal handlers, where an escaping
 * exception has nowhere to go, so every path that modifies the budget wraps
 * itself here.
 *
 * Only that one refusal is caught. A genuine bug still crashes loudly, which
 * is the whole point of not catching everything.
 */
import { RemoteReadOnlyError } from '../data/remote/gateway.js'
import type { Notify } from './types.js'

/** Runs a modification, reporting a read-only budget instead of failing. */
export type WriteGuard = (action: () => void) => void

export function createWriteGuard(notify: Notify): WriteGuard {
  return (action) => {
    try {
      action()
    } catch (error) {
      if (!(error instanceof RemoteReadOnlyError)) throw error
      notify(error.message)
    }
  }
}
