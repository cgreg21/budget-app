/*
 * ui/views/charts-section.ts — the category charts, folded into an accordion.
 *
 * Whether the section is open is remembered from one run to the next by the
 * preferences store. While it is closed the charts are left alone; reopening
 * it catches up with everything that changed in the meantime.
 */
import Gtk from 'gi:Gtk-4.0'

import type { PreferencesStore } from '../../data/preferences-store.js'
import type { Transaction } from '../../domain/transaction.js'
import type { Component, DisposableComponent } from '../types.js'
import { onNotify } from '../widgets.js'
import { createCategoryCharts } from './category-charts.js'

const TITLE = 'Graphiques'

export interface ChartsSection extends Component<readonly Transaction[]>, DisposableComponent {}

export function createChartsSection(preferencesStore: PreferencesStore): ChartsSection {
  const charts = createCategoryCharts()
  let transactions: readonly Transaction[] = []

  const expander = new Gtk.Expander({
    labelWidget: new Gtk.Label({ label: TITLE, cssClasses: ['heading'] }),
    child: charts.widget,
    expanded: preferencesStore.chartsExpanded,
    marginStart: 12,
    marginEnd: 12,
    marginBottom: 12,
  })

  const sync = () => {
    const open = expander.expanded
    expander.setTooltipText(open ? 'Masquer les graphiques' : 'Afficher les graphiques')
    if (open) charts.update(transactions)
  }

  sync()

  onNotify(expander, 'expanded', () => {
    preferencesStore.setChartsExpanded(expander.expanded)
    sync()
  })

  // The store also changes when the file is edited outside the app.
  const unsubscribe = preferencesStore.onChange(() => {
    expander.setExpanded(preferencesStore.chartsExpanded)
  })

  return {
    widget: expander,
    update: (next) => {
      transactions = next
      sync()
    },
    dispose: unsubscribe,
  }
}
