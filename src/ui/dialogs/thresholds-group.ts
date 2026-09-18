/*
 * ui/dialogs/thresholds-group.ts — the "balance thresholds" section of the
 * options dialog.
 *
 * The three amounts are edited together and saved in one go: the x < y < z
 * rule is about the triple, so checking a single row as it changes would
 * reject perfectly valid intermediate edits.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import type { ThresholdsStore } from '../../data/thresholds-store.js'
import { areThresholdsOrdered, type BalanceThresholds } from '../../domain/balance.js'
import type { AdwPreferencesGroup, AdwSpinRow } from '../gtk-types.js'
import type { Notify } from '../types.js'
import { createWriteGuard } from '../write-guard.js'

const AMOUNT_LIMIT = 1_000_000
const AMOUNT_STEP = 10
const AMOUNT_PAGE_STEP = 100

/** Pango markup, hence the escaped "<". */
const ORDER_RULE = 'x &lt; y &lt; z'

export interface ThresholdsGroupOptions {
  store: ThresholdsStore
  notify: Notify
}

export interface ThresholdsGroup {
  group: AdwPreferencesGroup
  /** Releases the store subscription. */
  dispose(): void
}

function createAmountRow(title: string, subtitle: string): AdwSpinRow {
  return new Adw.SpinRow({
    title,
    subtitle,
    digits: 2,
    adjustment: new Gtk.Adjustment({
      lower: -AMOUNT_LIMIT,
      upper: AMOUNT_LIMIT,
      stepIncrement: AMOUNT_STEP,
      pageIncrement: AMOUNT_PAGE_STEP,
    }),
  })
}

export function createThresholdsGroup({ store, notify }: ThresholdsGroupOptions): ThresholdsGroup {
  const group = new Adw.PreferencesGroup({
    title: 'Seuils du solde',
    // Descriptions and toast titles go through Pango markup: "<" must be escaped.
    description: 'Couleur de fond du solde : rouge en dessous de x, orange de x à y, '
      + `jaune de y à z, vert à partir de z. Les seuils doivent respecter ${ORDER_RULE}.`,
  })

  const lowRow = createAmountRow('Seuil orange (x)', 'En dessous : rouge')
  const mediumRow = createAmountRow('Seuil jaune (y)', 'De x à y : orange')
  const highRow = createAmountRow('Seuil vert (z)', 'De y à z : jaune, au-delà : vert')

  const showStoredValues = () => {
    const { low, medium, high } = store.thresholds
    lowRow.setValue(low)
    mediumRow.setValue(medium)
    highRow.setValue(high)
  }

  const save = () => {
    const next: BalanceThresholds = {
      low: lowRow.value,
      medium: mediumRow.value,
      high: highRow.value,
    }

    if (!areThresholdsOrdered(next)) {
      notify(`Les seuils doivent respecter ${ORDER_RULE}`)
      return
    }

    createWriteGuard(notify)(() => {
      store.save(next)
      notify('Seuils enregistrés')
    })
  }

  const saveButton = new Gtk.Button({ label: 'Enregistrer', cssClasses: ['suggested-action'] })
  saveButton.on('clicked', save)
  group.setHeaderSuffix(saveButton)

  group.add(lowRow)
  group.add(mediumRow)
  group.add(highRow)

  showStoredValues()
  const unsubscribe = store.onChange(showStoredValues)

  return { group, dispose: unsubscribe }
}
