/*
 * ui/views/category-charts.ts — side-by-side pie charts of expenses and
 * income, broken down by category.
 *
 * The slices are computed by the domain layer (`sumByCategory`); this module
 * only assigns colours and paints them with Cairo on a Gtk.DrawingArea.
 */
import Gtk from 'gi:Gtk-4.0'
import Pango from 'gi:Pango-1.0'

import { sumByCategory, type CategoryTotal, type Transaction } from '../../domain/transaction.js'
import { asCairoContext, type Rgb } from '../cairo.js'
import { formatAmount, formatPercent } from '../format.js'
import type { GtkBox } from '../gtk-types.js'
import type { Component } from '../types.js'
import { clearBox } from '../widgets.js'

/** A qualitative palette, cycled through category by category. */
const PALETTE: readonly Rgb[] = [
  [0.2, 0.51, 0.85],
  [0.9, 0.49, 0.13],
  [0.16, 0.63, 0.41],
  [0.75, 0.22, 0.17],
  [0.58, 0.35, 0.75],
  [0.85, 0.65, 0.13],
  [0.35, 0.66, 0.71],
  [0.55, 0.55, 0.55],
]

const EMPTY_PIE_ALPHA = 0.08
const PIE_PADDING = 6
const SWATCH_SIZE = 12

interface Slice {
  label: string
  value: number
  color: Rgb
}

function toSlices(totals: readonly CategoryTotal[]): Slice[] {
  return totals.map(({ category, amount }, index) => ({
    label: category,
    value: amount,
    color: PALETTE[index % PALETTE.length],
  }))
}

function sumSlices(slices: readonly Slice[]): number {
  return slices.reduce((total, slice) => total + slice.value, 0)
}

function createPie(slices: () => readonly Slice[]) {
  const area = new Gtk.DrawingArea({
    contentWidth: 200,
    contentHeight: 200,
    hexpand: true,
    valign: Gtk.Align.CENTER,
  })

  area.setDrawFunc((_area, cr, width, height) => {
    const ctx = asCairoContext(cr)
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.min(width, height) / 2 - PIE_PADDING

    const current = slices()
    const total = sumSlices(current)

    if (total <= 0) {
      ctx.setSourceRgba(0, 0, 0, EMPTY_PIE_ALPHA)
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.fill()
      return
    }

    let angle = -Math.PI / 2 // start at 12 o'clock
    for (const slice of current) {
      const sweep = (slice.value / total) * Math.PI * 2
      const [red, green, blue] = slice.color
      ctx.setSourceRgb(red, green, blue)
      ctx.moveTo(centerX, centerY)
      ctx.arc(centerX, centerY, radius, angle, angle + sweep)
      ctx.closePath()
      ctx.fill()
      angle += sweep
    }
  })

  return area
}

function createLegendEntry(slice: Slice, share: number): GtkBox {
  const [red, green, blue] = slice.color

  const swatch = new Gtk.DrawingArea({
    contentWidth: SWATCH_SIZE,
    contentHeight: SWATCH_SIZE,
    valign: Gtk.Align.CENTER,
  })
  swatch.setDrawFunc((_area, cr, width, height) => {
    const ctx = asCairoContext(cr)
    ctx.setSourceRgb(red, green, blue)
    ctx.rectangle(0, 0, width, height)
    ctx.fill()
  })

  const entry = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
  entry.append(swatch)
  entry.append(new Gtk.Label({
    label: `${slice.label} — ${formatAmount(slice.value)} (${formatPercent(share)})`,
    xalign: 0,
    hexpand: true,
    ellipsize: Pango.EllipsizeMode.END,
  }))
  return entry
}

function createPieChart(title: string): Component<readonly Slice[]> {
  let slices: readonly Slice[] = []

  const area = createPie(() => slices)
  const legend = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4, marginTop: 8 })

  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    cssClasses: ['card', 'budget-card'],
    hexpand: true,
  })
  container.append(new Gtk.Label({ label: title, cssClasses: ['title-4'], xalign: 0 }))
  container.append(area)
  container.append(legend)

  return {
    widget: container,
    update: (nextSlices) => {
      slices = nextSlices
      area.queueDraw()
      clearBox(legend)

      if (slices.length === 0) {
        legend.append(new Gtk.Label({ label: 'Aucune donnée', cssClasses: ['dim-label'], xalign: 0 }))
        return
      }

      const total = sumSlices(slices)
      for (const slice of slices) {
        legend.append(createLegendEntry(slice, total > 0 ? slice.value / total : 0))
      }
    },
  }
}

export function createCategoryCharts(): Component<readonly Transaction[]> {
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 12,
    marginTop: 8, // the surrounding accordion owns the outer margins
    homogeneous: true,
  })

  const expenseChart = createPieChart('Dépenses par catégorie')
  const incomeChart = createPieChart('Revenus par catégorie')
  container.append(expenseChart.widget)
  container.append(incomeChart.widget)

  return {
    widget: container,
    update: (transactions) => {
      expenseChart.update(toSlices(sumByCategory(transactions, 'expense')))
      incomeChart.update(toSlices(sumByCategory(transactions, 'income')))
    },
  }
}
