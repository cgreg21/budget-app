/*
 * data/atomic-write.ts — write a file so that readers never see it half done.
 *
 * The contents go to a sibling temporary file first, then take the place of
 * the target with a rename, which the filesystem performs as one step. A crash
 * or a concurrent reader (another instance watching the directory) therefore
 * finds either the previous version or the new one, never a truncated file.
 */
import fs from 'node:fs'
import path from 'node:path'

export function writeFileAtomic(filePath: string, contents: string): void {
  const directory = path.dirname(filePath)
  fs.mkdirSync(directory, { recursive: true })
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
  try {
    fs.writeFileSync(tempPath, contents, 'utf-8')
    fs.renameSync(tempPath, filePath)
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true })
    } catch {
      // the temporary file is already gone
    }
    throw error
  }
}
