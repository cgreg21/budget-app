/*
 * data/remote/gateway.ts — the one-way door between the stores and the cloud.
 *
 * `JsonFileStore` must not know what WebDAV is, and the sync engine must not
 * know what a budget is. This module is the thin agreement between them: two
 * verbs to mirror a file, and one question — may I write at all?
 *
 * It is a module-level registry rather than a constructor parameter because
 * "is this budget editable right now" is a property of the running
 * application, not of any one store; threading it through every store, every
 * month opened on demand and every standalone file helper would spread a
 * single global fact across a dozen signatures. The same reasoning already
 * makes `paths.ts` module-level state.
 */

/**
 * Raised instead of writing when the remote is configured but unreachable.
 * The message is written for the user: it goes straight into a toast.
 */
export class RemoteReadOnlyError extends Error {
  constructor(message = 'Hors ligne — le budget est en lecture seule') {
    super(message)
    this.name = 'RemoteReadOnlyError'
  }
}

export interface RemoteGateway {
  /** Throws `RemoteReadOnlyError` when the budget may not be modified now. */
  assertWritable(): void
  /** Mirrors a local file to the server. Returns at once; failures surface in the status. */
  pushFile(localPath: string): void
  /** Mirrors the removal of a local file. Same contract as `pushFile`. */
  removeFile(localPath: string): void
}

let gateway: RemoteGateway | null = null

/** Installs the running gateway, or `null` to go back to plain local storage. */
export function setRemoteGateway(next: RemoteGateway | null): void {
  gateway = next
}

export function getRemoteGateway(): RemoteGateway | null {
  return gateway
}

/** Local-only storage has nothing to refuse, so no gateway means "go ahead". */
export function assertRemoteWritable(): void {
  gateway?.assertWritable()
}

export function pushToRemote(localPath: string): void {
  gateway?.pushFile(localPath)
}

export function removeFromRemote(localPath: string): void {
  gateway?.removeFile(localPath)
}
