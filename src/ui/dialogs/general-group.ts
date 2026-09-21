import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import type { GeneralSettingsStore } from '../../data/general-settings-store.js'
import type {
  AmountFormat,
  AppLanguage,
  Currency,
  DateFormat,
  Theme,
} from '../../domain/general-settings.js'
import { setLocale, t } from '../../i18n/index.js'
import { configureDisplaySettings } from '../format.js'
import { applyTheme } from '../theme.js'
import type { AdwComboRow, AdwPreferencesGroup } from '../gtk-types.js'
import type { Notify } from '../types.js'
import { onNotify } from '../widgets.js'

interface Choice<T extends string> {
  value: T
  label: string
}

function createChoiceRow<T extends string>(title: string, choices: readonly Choice<T>[]): AdwComboRow {
  return new Adw.ComboRow({
    title,
    model: Gtk.StringList.new(choices.map((choice) => choice.label)),
  })
}

function selected<T extends string>(row: AdwComboRow, choices: readonly Choice<T>[]): T {
  return choices[row.selected]?.value ?? choices[0]!.value
}

export interface GeneralGroupOptions {
  store: GeneralSettingsStore
  notify: Notify
}

export interface GeneralGroup {
  group: AdwPreferencesGroup
  dispose(): void
}

export function createGeneralGroup({ store, notify }: GeneralGroupOptions): GeneralGroup {
  const strings = t().generalSettings
  const languages: readonly Choice<AppLanguage>[] = [
    { value: 'fr', label: strings.languageFrench },
    { value: 'en', label: strings.languageEnglish },
  ]
  const currencies: readonly Choice<Currency>[] = [
    { value: 'EUR', label: 'EUR (€)' },
    { value: 'USD', label: 'USD ($)' },
    { value: 'GBP', label: 'GBP (£)' },
    { value: 'CHF', label: 'CHF' },
  ]
  const dates: readonly Choice<DateFormat>[] = [
    { value: 'locale', label: strings.dateLocale },
    { value: 'dd-mm-yyyy', label: '31/12/2026' },
    { value: 'mm-dd-yyyy', label: '12/31/2026' },
    { value: 'yyyy-mm-dd', label: '2026-12-31' },
  ]
  const amounts: readonly Choice<AmountFormat>[] = [
    { value: 'locale', label: strings.amountLocale },
    { value: 'space-comma', label: '1 234,56' },
    { value: 'comma-dot', label: '1,234.56' },
  ]
  const themes: readonly Choice<Theme>[] = [
    { value: 'system', label: strings.themeSystem },
    { value: 'light', label: strings.themeLight },
    { value: 'dark', label: strings.themeDark },
  ]

  const languageRow = createChoiceRow(strings.languageTitle, languages)
  const currencyRow = createChoiceRow(strings.currencyTitle, currencies)
  const dateRow = createChoiceRow(strings.dateFormatTitle, dates)
  const amountRow = createChoiceRow(strings.amountFormatTitle, amounts)
  const themeRow = createChoiceRow(strings.themeTitle, themes)
  const group = new Adw.PreferencesGroup({
    title: strings.groupTitle,
    description: strings.groupDescription,
  })
  const saveButton = new Gtk.Button({ label: strings.saveButton, cssClasses: ['suggested-action'] })

  const showStoredValues = () => {
    const settings = store.settings
    languageRow.selected = languages.findIndex(({ value }) => value === settings.language)
    currencyRow.selected = currencies.findIndex(({ value }) => value === settings.currency)
    dateRow.selected = dates.findIndex(({ value }) => value === settings.dateFormat)
    amountRow.selected = amounts.findIndex(({ value }) => value === settings.amountFormat)
    themeRow.selected = themes.findIndex(({ value }) => value === settings.theme)
  }

  saveButton.on('clicked', () => {
    store.save({
      language: selected(languageRow, languages),
      currency: selected(currencyRow, currencies),
      dateFormat: selected(dateRow, dates),
      amountFormat: selected(amountRow, amounts),
      theme: selected(themeRow, themes),
    })
    setLocale(store.settings.language)
    configureDisplaySettings(store.settings)
    applyTheme(store.settings.theme)
    notify(strings.saved)
  })
  group.setHeaderSuffix(saveButton)
  group.add(languageRow)
  group.add(currencyRow)
  group.add(dateRow)
  group.add(amountRow)
  group.add(themeRow)

  showStoredValues()
  const unsubscribe = store.onChange(showStoredValues)
  onNotify(languageRow, 'selected', () => saveButton.setSensitive(true))
  return { group, dispose: unsubscribe }
}
