/*
 * app/app-info.ts — identity of the application, in one place.
 */
import { t } from '../i18n/index.js'

export const APP_ID = 'com.arkdev.BudgetApp'
export const APP_NAME = 'Budget App'
export const APP_VERSION = '0.1.0'

/** Read lazily so it follows the language detected at startup. */
export function appDescription(): string {
  return t().appInfo.description
}

export const DEVELOPER_NAME = 'Ark'
export const DEVELOPERS = ['Ark <cgreg@ik.me>']
export const COPYRIGHT = 'Copyleft'
