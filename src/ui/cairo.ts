/*
 * ui/cairo.ts — a minimal, hand-written typing for the Cairo drawing context.
 *
 * Cairo is not a GObject library, so its introspection-generated types are
 * empty placeholders. node-gtk ships a native binding that does expose the
 * real (camelCase) methods at runtime — see
 * `node_modules/node-gtk/src/modules/cairo/context.cc`. The interface below
 * declares exactly the subset the charts use; `asCairoContext()` is the single
 * place where the cast happens.
 */

export interface CairoContext {
  setSourceRgb(red: number, green: number, blue: number): void
  setSourceRgba(red: number, green: number, blue: number, alpha: number): void
  moveTo(x: number, y: number): void
  arc(centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number): void
  rectangle(x: number, y: number, width: number, height: number): void
  closePath(): void
  fill(): void
}

export function asCairoContext(cr: unknown): CairoContext {
  return cr as CairoContext
}

/** An RGB colour with components in the 0–1 range, as Cairo expects. */
export type Rgb = readonly [red: number, green: number, blue: number]
