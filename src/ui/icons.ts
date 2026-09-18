/*
 * ui/icons.ts — the icon palette offered by the category icon picker.
 *
 * Every name here was checked against the Adwaita icon theme shipped with the
 * app; the label is the tooltip shown under the cursor, translated through
 * `i18n/strings.ts`. Keep the list short and budget-minded: a wall of icons
 * is harder to choose from.
 */
import { t, type IconKey } from '../i18n/index.js'

export interface IconChoice {
  name: string
  key: IconKey
}

export const CATEGORY_ICON_CHOICES: readonly IconChoice[] = [
  { name: 'emoji-food-symbolic', key: 'food' },
  { name: 'user-home-symbolic', key: 'housing' },
  { name: 'thunderbolt-symbolic', key: 'energy' },
  { name: 'weather-showers-symbolic', key: 'water' },
  { name: 'night-light-symbolic', key: 'heating' },
  { name: 'applications-engineering-symbolic', key: 'diy' },
  { name: 'emoji-travel-symbolic', key: 'transport' },
  { name: 'airplane-mode-symbolic', key: 'travel' },
  { name: 'find-location-symbolic', key: 'commute' },
  { name: 'emoji-activities-symbolic', key: 'leisure' },
  { name: 'applications-games-symbolic', key: 'games' },
  { name: 'folder-music-symbolic', key: 'music' },
  { name: 'audio-headphones-symbolic', key: 'audio' },
  { name: 'camera-photo-symbolic', key: 'photo' },
  { name: 'tv-symbolic', key: 'tv' },
  { name: 'media-optical-symbolic', key: 'media' },
  { name: 'emote-love-symbolic', key: 'health' },
  { name: 'emoji-body-symbolic', key: 'sport' },
  { name: 'security-high-symbolic', key: 'insurance' },
  { name: 'value-increase-symbolic', key: 'income' },
  { name: 'value-decrease-symbolic', key: 'expenses' },
  { name: 'accessories-calculator-symbolic', key: 'accounts' },
  { name: 'package-x-generic-symbolic', key: 'shopping' },
  { name: 'x-office-spreadsheet-symbolic', key: 'spreadsheet' },
  { name: 'x-office-document-symbolic', key: 'admin' },
  { name: 'mail-send-symbolic', key: 'mail' },
  { name: 'x-office-calendar-symbolic', key: 'calendar' },
  { name: 'web-browser-symbolic', key: 'subscriptions' },
  { name: 'network-wireless-symbolic', key: 'internet' },
  { name: 'phone-symbolic', key: 'phone' },
  { name: 'computer-symbolic', key: 'computer' },
  { name: 'accessories-dictionary-symbolic', key: 'education' },
  { name: 'user-bookmarks-symbolic', key: 'books' },
  { name: 'system-users-symbolic', key: 'family' },
  { name: 'avatar-default-symbolic', key: 'personal' },
  { name: 'emoji-nature-symbolic', key: 'nature' },
  { name: 'weather-clear-symbolic', key: 'holidays' },
  { name: 'starred-symbolic', key: 'favorite' },
  { name: 'emblem-important-symbolic', key: 'important' },
  { name: 'folder-symbolic', key: 'other' },
]

/** The tooltip of an icon, falling back to its name for unknown ones. */
export function iconLabel(name: string): string {
  const choice = CATEGORY_ICON_CHOICES.find((candidate) => candidate.name === name)
  return choice ? t().icons[choice.key] : name
}
