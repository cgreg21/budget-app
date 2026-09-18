/*
 * data/remote/provider.ts — the seam that makes the storage multi-cloud.
 *
 * Everything above this file talks about *files in a directory on a server*;
 * everything below decides how that is actually spelled on the wire. WebDAV
 * is the implementation shipped today — it alone already covers Nextcloud,
 * ownCloud, Koofr, pCloud, Yandex Disk and box.com — but adding a provider
 * means writing this interface again, not touching the sync engine.
 *
 * Paths are always relative to the provider's own root, use "/" as separator,
 * and never start with one. Contents are UTF-8 text: the budget is JSON.
 */

export interface RemoteEntry {
  /** File name only, without any directory part. */
  name: string
  /** Whether the entry is a directory rather than a file. */
  isDirectory: boolean
}

export interface RemoteProvider {
  /** Short, human-readable name of the server, for messages. */
  readonly label: string

  /**
   * Checks the server answers and the credentials are accepted.
   * Rejects with a message meant to be shown to the user.
   */
  probe(): Promise<void>

  /** Directory contents, one level deep. An absent directory lists as empty. */
  list(remotePath: string): Promise<RemoteEntry[]>

  /** File contents, or `null` when the file does not exist. */
  read(remotePath: string): Promise<string | null>

  /** Creates or replaces a file, creating parent directories as needed. */
  write(remotePath: string, contents: string): Promise<void>

  /** Deletes a file. A file that is already gone is not an error. */
  remove(remotePath: string): Promise<void>

  /** Creates a directory and its parents. An existing directory is not an error. */
  ensureDirectory(remotePath: string): Promise<void>
}

/**
 * A server answered, and said no. Carries the HTTP status so the engine can
 * tell "unreachable" (stay offline, retry later) from "refused" (stop and
 * report): a wrong password will not fix itself by waiting.
 */
export class RemoteRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'RemoteRequestError'
    this.status = status
  }
}
