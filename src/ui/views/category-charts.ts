/*
 * ui/views/category-charts.ts — stacked pie charts of expenses and income,
 * broken down by category. They fill the column standing beside the
 * transaction list, half of its height each.
 *
 * The slices are computed by the domain layer (`sumByCategory`); this module
 * only assigns colours and paints them with Cairo on a Gtk.DrawingArea.
 */
import Gtk from 'gi:Gtk-4.0'
import Gdk from 'gi:Gdk-4.0'

import { sumByCategory, type CategoryTotal, type Transaction } from '../../domain/transaction.js'
import { t } from '../../i18n/index.js'
import { asCairoContext, type Rgb } from '../cairo.js'
import { formatAmount, formatPercent } from '../format.js'
import type { GtkBox } from '../gtk-types.js'
import type { Component } from '../types.js'
import { clearBox, onNotify } from '../widgets.js'

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
/** Floor for the pie; above it the chart grows with the column. */
const PIE_MIN_SIZE = 120
const SWATCH_SIZE = 12
const HOVER_DELAY_MS = 0

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

function createPie(
  slices: () => readonly Slice[],
  details: (slice: Slice, share: number) => string,
) {
  const area = new Gtk.DrawingArea({
    contentWidth: PIE_MIN_SIZE,
    contentHeight: PIE_MIN_SIZE,
    hexpand: true,
    // Soaks up whatever the title and the legend leave in the card.
    vexpand: true,
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

  const sliceAt = (x: number, y: number): Slice | undefined => {
    const current = slices()
    const total = sumSlices(current)
    if (total <= 0) return undefined

    const width = area.getAllocatedWidth()
    const height = area.getAllocatedHeight()
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.min(width, height) / 2 - PIE_PADDING
    const distance = Math.hypot(x - centerX, y - centerY)
    if (distance > radius) return undefined

    let angle = Math.atan2(y - centerY, x - centerX) + Math.PI / 2
    if (angle < 0) angle += Math.PI * 2

    let covered = 0
    for (const slice of current) {
      covered += (slice.value / total) * Math.PI * 2
      if (angle <= covered) return slice
    }
    return current.at(-1)
  }

  const popover = new Gtk.Popover({
    autohide: false,
    hasArrow: true,
    position: Gtk.PositionType.TOP,
    cssClasses: ['budget-details'],
  })
  popover.setParent(area)

  let timer: NodeJS.Timeout | undefined
  let activeSlice: Slice | undefined
  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  const close = () => {
    cancel()
    activeSlice = undefined
    popover.popdown()
  }

  const motion = new Gtk.EventControllerMotion()
  motion.on('motion', (x, y) => {
    const current = slices()
    const total = sumSlices(current)
    const slice = sliceAt(x, y)
    if (!slice || total <= 0) {
      close()
      return
    }
    const pointingTo = new Gdk.Rectangle({
      x: Math.round(x),
      y: Math.round(y),
      width: 1,
      height: 1,
    })
    if (slice === activeSlice) {
      popover.pointingTo = pointingTo
      return
    }

    cancel()
    timer = setTimeout(() => {
      timer = undefined
      activeSlice = slice
      popover.pointingTo = pointingTo
      popover.setChild(new Gtk.Label({
        label: details(slice, slice.value / total),
        marginTop: 8,
        marginBottom: 8,
        marginStart: 10,
        marginEnd: 10,
      }))
      popover.popup()
    }, HOVER_DELAY_MS)
  })
  motion.on('leave', close)
  area.addController(motion)

  onNotify(area, 'root', () => {
    if (area.getRoot() !== null) return
    close()
    popover.unparent()
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
  }))
  return entry
}

function createPieChart(title: string): Component<readonly Slice[]> {
  let slices: readonly Slice[] = []

  const area = createPie(
    () => slices,
    (slice, share) => t().categoryCharts.sliceDetails(slice.label, formatAmount(slice.value), formatPercent(share)),
  )
  const legend = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4, marginTop: 8 })

  // With the card's height now fixed, a long category list scrolls instead of
  // crushing the pie.
  const legendScroller = new Gtk.ScrolledWindow({
    hscrollbarPolicy: Gtk.PolicyType.NEVER,
    propagateNaturalHeight: true,
  })
  legendScroller.setChild(legend)

  const legendPopover = new Gtk.Popover()
  legendPopover.setChild(legendScroller)
  const legendButton = new Gtk.MenuButton({
    iconName: 'help-about-symbolic',
    tooltipText: t().categoryCharts.legendTooltip,
    cssClasses: ['flat', 'circular'],
    popover: legendPopover,
  })
  const header = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
  header.append(new Gtk.Label({ label: title, cssClasses: ['title-4'], xalign: 0, hexpand: true }))
  header.append(legendButton)

  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    cssClasses: ['card', 'budget-card'],
    hexpand: true,
  })
  container.append(header)
  container.append(area)

  return {
    widget: container,
    update: (nextSlices) => {
      slices = nextSlices
      area.queueDraw()
      clearBox(legend)

      if (slices.length === 0) {
        legend.append(new Gtk.Label({ label: t().categoryCharts.noData, cssClasses: ['dim-label'], xalign: 0 }))
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
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 12,
    marginEnd: 12,
    marginBottom: 12,
    homogeneous: true, // half of the column's height each
    vexpand: true,
  })

  const recurringExpenseChart = createPieChart(t().categoryCharts.recurringExpenseTitle)
  const otherExpenseChart = createPieChart(t().categoryCharts.otherExpenseTitle)
  container.append(recurringExpenseChart.widget)
  container.append(otherExpenseChart.widget)

  return {
    widget: container,
    update: (transactions) => {
      recurringExpenseChart.update(toSlices(sumByCategory(
        transactions.filter((transaction) => transaction.recurrenceId !== undefined),
        'expense',
      )))
      otherExpenseChart.update(toSlices(sumByCategory(
        transactions.filter((transaction) => transaction.recurrenceId === undefined),
        'expense',
      )))
    },
  }
}
