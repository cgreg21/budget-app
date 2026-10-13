/*
 * test/helpers/adw-stub.ts — stands in for `gi:Adw-1` under Vitest.
 *
 * `ui/theme.ts` only needs the default `Adw.StyleManager` and the
 * `Adw.ColorScheme` constants. The stub records the last colour scheme asked
 * for, so the theme mapping can be checked without a display server.
 */
export const ColorScheme = {
  DEFAULT: 0,
  FORCE_LIGHT: 1,
  FORCE_DARK: 4,
}

const defaultManager = {
  colorScheme: ColorScheme.DEFAULT,
  setColorScheme(scheme: number): void {
    this.colorScheme = scheme
  },
}

export const StyleManager = {
  getDefault(): typeof defaultManager {
    return defaultManager
  },
}

/** The colour scheme most recently applied to the default style manager. */
export function appliedColorScheme(): number {
  return defaultManager.colorScheme
}

const Adw = { ColorScheme, StyleManager }

export default Adw
