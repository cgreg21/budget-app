import { describe, expect, it } from 'vitest'
import { asCairoContext, type CairoContext } from '../../src/ui/cairo.js'

describe('asCairoContext', () => {
  it('returns the very object it was given', () => {
    const context = { setSourceRgb: () => {} }
    expect(asCairoContext(context)).toBe(context)
  })

  it('exposes the drawing methods the charts rely on', () => {
    const calls: string[] = []
    const stub: CairoContext = {
      setSourceRgb: () => calls.push('setSourceRgb'),
      setSourceRgba: () => calls.push('setSourceRgba'),
      moveTo: () => calls.push('moveTo'),
      arc: () => calls.push('arc'),
      rectangle: () => calls.push('rectangle'),
      closePath: () => calls.push('closePath'),
      fill: () => calls.push('fill'),
    }

    const cr = asCairoContext(stub)
    cr.setSourceRgb(1, 0, 0)
    cr.setSourceRgba(1, 0, 0, 0.5)
    cr.moveTo(0, 0)
    cr.arc(0, 0, 1, 0, Math.PI)
    cr.rectangle(0, 0, 10, 10)
    cr.closePath()
    cr.fill()

    expect(calls).toEqual([
      'setSourceRgb',
      'setSourceRgba',
      'moveTo',
      'arc',
      'rectangle',
      'closePath',
      'fill',
    ])
  })
})
