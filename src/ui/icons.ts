/*
 * ui/icons.ts — the icon palette offered by the category icon picker.
 *
 * Every name here was checked against the Adwaita icon theme shipped with the
 * app; the French label is the tooltip shown under the cursor. Keep the list
 * short and budget-minded: a wall of icons is harder to choose from.
 */

export interface IconChoice {
  name: string
  label: string
}

export const CATEGORY_ICON_CHOICES: readonly IconChoice[] = [
  { name: 'emoji-food-symbolic', label: 'Alimentation' },
  { name: 'user-home-symbolic', label: 'Logement' },
  { name: 'thunderbolt-symbolic', label: 'Énergie' },
  { name: 'weather-showers-symbolic', label: 'Eau' },
  { name: 'night-light-symbolic', label: 'Chauffage' },
  { name: 'applications-engineering-symbolic', label: 'Bricolage' },
  { name: 'emoji-travel-symbolic', label: 'Transport' },
  { name: 'airplane-mode-symbolic', label: 'Voyage' },
  { name: 'find-location-symbolic', label: 'Déplacements' },
  { name: 'emoji-activities-symbolic', label: 'Loisirs' },
  { name: 'applications-games-symbolic', label: 'Jeux' },
  { name: 'folder-music-symbolic', label: 'Musique' },
  { name: 'audio-headphones-symbolic', label: 'Audio' },
  { name: 'camera-photo-symbolic', label: 'Photo' },
  { name: 'tv-symbolic', label: 'Télévision' },
  { name: 'media-optical-symbolic', label: 'Médias' },
  { name: 'emote-love-symbolic', label: 'Santé' },
  { name: 'emoji-body-symbolic', label: 'Sport' },
  { name: 'security-high-symbolic', label: 'Assurance' },
  { name: 'value-increase-symbolic', label: 'Revenus' },
  { name: 'value-decrease-symbolic', label: 'Charges' },
  { name: 'accessories-calculator-symbolic', label: 'Comptes' },
  { name: 'package-x-generic-symbolic', label: 'Achats' },
  { name: 'x-office-spreadsheet-symbolic', label: 'Tableur' },
  { name: 'x-office-document-symbolic', label: 'Administratif' },
  { name: 'mail-send-symbolic', label: 'Courrier' },
  { name: 'x-office-calendar-symbolic', label: 'Agenda' },
  { name: 'web-browser-symbolic', label: 'Abonnements' },
  { name: 'network-wireless-symbolic', label: 'Internet' },
  { name: 'phone-symbolic', label: 'Téléphone' },
  { name: 'computer-symbolic', label: 'Informatique' },
  { name: 'accessories-dictionary-symbolic', label: 'Éducation' },
  { name: 'user-bookmarks-symbolic', label: 'Livres' },
  { name: 'system-users-symbolic', label: 'Famille' },
  { name: 'avatar-default-symbolic', label: 'Personnel' },
  { name: 'emoji-nature-symbolic', label: 'Nature' },
  { name: 'weather-clear-symbolic', label: 'Vacances' },
  { name: 'starred-symbolic', label: 'Favori' },
  { name: 'emblem-important-symbolic', label: 'Important' },
  { name: 'folder-symbolic', label: 'Autres' },
]

/** The tooltip of an icon, falling back to its name for unknown ones. */
export function iconLabel(name: string): string {
  return CATEGORY_ICON_CHOICES.find((choice) => choice.name === name)?.label ?? name
}
