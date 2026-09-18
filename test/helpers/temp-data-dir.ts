/*
 * test/helpers/temp-data-dir.ts — an isolated data directory per test.
 *
 * `data/paths.ts` resolves `DATA_DIR` once, when the module is first
 * evaluated. Pointing the GLib stub at a fresh folder therefore has to be
 * followed by `vi.resetModules()`, so the store modules are re-imported and
 * pick the new location up. Tests consequently import the data layer with a
 * dynamic `import()` *after* calling `createTempUserDataDir()`.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { vi } from 'vitest'

import { USER_DATA_DIR_ENV } from './glib-stub.js'

export interface TempDataDir {
  /** The value `GLib.getUserDataDir()` now returns. */
  root: string
  /** `<root>/budget-app`, where the app keeps its files. */
  dataDir: string
  monthsDir: string
}

export function createTempUserDataDir(): TempDataDir {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-app-test-'))
  process.env[USER_DATA_DIR_ENV] = root
  vi.resetModules()

  const dataDir = path.join(root, 'budget-app')
  return { root, dataDir, monthsDir: path.join(dataDir, 'months') }
}

export function removeTempUserDataDir(temp: TempDataDir): void {
  delete process.env[USER_DATA_DIR_ENV]
  fs.rmSync(temp.root, { recursive: true, force: true })
}

export function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8')
}

export function writeText(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents, 'utf-8')
}

export function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

/**
 * Polls until `predicate` holds. Filesystem watchers report changes through
 * the OS, so the store's debounced reload cannot be driven by fake timers.
 */
export async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the expected state')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
