/*
 * data/id.ts — identifiers for the records the app stores.
 *
 * GLib's UUIDs are random and collision-free across files, which is what the
 * stores need: ids travel between a recurrence and the transactions it
 * produces, and files may be edited or synced from outside.
 */
import GLib from 'gi:GLib-2.0'

export function createId(): string {
  return GLib.uuidStringRandom()
}
