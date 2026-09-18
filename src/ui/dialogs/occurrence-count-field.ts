/*
 * ui/dialogs/occurrence-count-field.ts — the optional length of a series,
 * shared by the recurrence form and the transaction form.
 *
 * A series runs forever unless the switch is turned on, in which case it stops
 * after the given number of occurrences. Keeping the two rows together means
 * both forms express the limit the same way.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import { MAX_OCCURRENCES, MIN_OCCURRENCES } from '../../domain/recurrence.js'
import type { GtkWidget } from '../gtk-types.js'
import { onNotify } from '../widgets.js'

/** Proposed length when the limit is switched on for the first time. */
const DEFAULT_OCCURRENCES = 12

export interface OccurrenceCountField {
  rows: GtkWidget[]
  /** The number of occurrences, or `undefined` when the series has no end. */
  read(): number | undefined
  /** Greys the whole field out — used while no frequency is selected. */
  setEnabled(enabled: boolean): void
}

export function createOccurrenceCountField(occurrences: number | undefined): OccurrenceCountField {
  const limitRow = new Adw.SwitchRow({
    title: 'Durée limitée',
    subtitle: 'Sinon la série se répète sans fin',
    active: occurrences !== undefined,
  })

  const countRow = new Adw.SpinRow({
    title: 'Nombre d’occurrences',
    sensitive: occurrences !== undefined,
    adjustment: new Gtk.Adjustment({
      lower: MIN_OCCURRENCES,
      upper: MAX_OCCURRENCES,
      stepIncrement: 1,
      pageIncrement: 6,
      value: occurrences ?? DEFAULT_OCCURRENCES,
    }),
  })

  let enabled = true
  const refresh = () => {
    limitRow.setSensitive(enabled)
    countRow.setSensitive(enabled && limitRow.active)
  }

  onNotify(limitRow, 'active', refresh)

  return {
    rows: [limitRow, countRow],
    read: () => (limitRow.active ? Math.round(countRow.value) : undefined),
    setEnabled: (next: boolean) => {
      enabled = next
      refresh()
    },
  }
}
