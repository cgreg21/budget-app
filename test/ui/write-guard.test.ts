/*
 * The guard that stands between a GTK signal handler and a budget that has
 * gone read-only. Two cases only: the refusal it is there for, and everything
 * else, which must keep escaping so a real bug stays visible.
 */
import { describe, expect, it, vi } from 'vitest'

import { RemoteReadOnlyError } from '../../src/data/remote/gateway.js'
import { createWriteGuard } from '../../src/ui/write-guard.js'

describe('createWriteGuard', () => {
  it('runs the modification when nothing objects', () => {
    const notify = vi.fn()
    const action = vi.fn()

    createWriteGuard(notify)(action)

    expect(action).toHaveBeenCalledOnce()
    expect(notify).not.toHaveBeenCalled()
  })

  it('reports a read-only budget instead of failing', () => {
    const notify = vi.fn()

    createWriteGuard(notify)(() => {
      throw new RemoteReadOnlyError('Hors ligne — le budget est en lecture seule')
    })

    expect(notify).toHaveBeenCalledWith('Hors ligne — le budget est en lecture seule')
  })

  it('lets any other failure through', () => {
    const notify = vi.fn()
    const guard = createWriteGuard(notify)

    expect(() => guard(() => { throw new TypeError('bug') })).toThrow('bug')
    expect(notify).not.toHaveBeenCalled()
  })

  it('can be reused', () => {
    const notify = vi.fn()
    const guard = createWriteGuard(notify)

    guard(() => {})
    guard(() => {
      throw new RemoteReadOnlyError('refusé')
    })
    guard(() => {})

    expect(notify).toHaveBeenCalledExactlyOnceWith('refusé')
  })
})
