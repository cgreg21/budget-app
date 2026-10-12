import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { writeFileAtomic } from '../../src/data/atomic-write.js'

describe('writeFileAtomic', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-app-atomic-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('creates missing directories and leaves only the target file behind', () => {
    const target = path.join(dir, 'nested', 'data.json')
    writeFileAtomic(target, '{"a":1}')
    expect(fs.readFileSync(target, 'utf-8')).toBe('{"a":1}')
    expect(fs.readdirSync(path.dirname(target))).toEqual(['data.json'])
  })

  it('replaces the previous contents', () => {
    const target = path.join(dir, 'data.json')
    writeFileAtomic(target, 'one')
    writeFileAtomic(target, 'two')
    expect(fs.readFileSync(target, 'utf-8')).toBe('two')
    expect(fs.readdirSync(dir)).toEqual(['data.json'])
  })

  it('keeps the previous file intact and cleans up when the write fails', () => {
    const target = path.join(dir, 'data.json')
    fs.writeFileSync(target, 'before', 'utf-8')
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('disk full')
    })
    expect(() => writeFileAtomic(target, 'after')).toThrow('disk full')
    expect(fs.readFileSync(target, 'utf-8')).toBe('before')
    expect(fs.readdirSync(dir)).toEqual(['data.json'])
  })
})
