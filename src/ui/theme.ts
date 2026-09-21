import Adw from 'gi:Adw-1'

import type { Theme } from '../domain/general-settings.js'

type StyleManagerClass = typeof Adw.StyleManager & {
  getDefault(): InstanceType<typeof Adw.StyleManager>
}

export function applyTheme(theme: Theme): void {
  const manager = (Adw.StyleManager as unknown as StyleManagerClass).getDefault()
  manager.setColorScheme(theme === 'light'
    ? Adw.ColorScheme.FORCE_LIGHT
    : theme === 'dark' ? Adw.ColorScheme.FORCE_DARK : Adw.ColorScheme.DEFAULT)
}
