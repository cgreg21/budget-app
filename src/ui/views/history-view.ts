import Gtk from 'gi:Gtk-4.0'
import Gdk from 'gi:Gdk-4.0'

import type { MonthKey } from '../../domain/month.js'
import { t } from '../../i18n/index.js'
import { formatAmount, formatMonth, formatShortMonthName } from '../format.js'
import { asCairoContext } from '../cairo.js'
import type { GtkBox } from '../gtk-types.js'
import type { Component } from '../types.js'
import { onNotify } from '../widgets.js'

export interface MonthlyTotals {
  month: MonthKey
  income: number
  expense: number
}

const CHART_HEIGHT = 360
const CHART_WIDTH = 900
const BAR_WIDTH = 22
const BAR_GAP = 8
const INCOME_COLOR = [0.15, 0.64, 0.4] as const
const EXPENSE_COLOR = [0.75, 0.2, 0.22] as const
const HOVER_DELAY_MS = 150

function createLegendItem(label: string, color: readonly [number, number, number]): GtkBox {
  const swatch = new Gtk.DrawingArea({ contentWidth: 12, contentHeight: 12, valign: Gtk.Align.CENTER })
  swatch.setDrawFunc((_area, cr, width, height) => {
    const ctx = asCairoContext(cr)
    ctx.setSourceRgb(...color)
    ctx.rectangle(0, 0, width, height)
    ctx.fill()
  })
  const item = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
  item.append(swatch)
  item.append(new Gtk.Label({ label }))
  return item
}

export function createHistoryView(): Component<readonly MonthlyTotals[]> {
  let values: readonly MonthlyTotals[] = []
  const area = new Gtk.DrawingArea({ contentWidth: CHART_WIDTH, contentHeight: CHART_HEIGHT, hexpand: true })
  const labels = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 0, widthRequest: CHART_WIDTH })
  const empty = new Gtk.Label({ cssClasses: ['dim-label'], halign: Gtk.Align.CENTER })

  const geometry = () => {
    const max = Math.max(1, ...values.flatMap(({ income, expense }) => [income, expense]))
    const baseline = area.getAllocatedHeight() - 24
    const chartHeight = baseline - 12
    return { max, baseline, chartHeight, groupWidth: area.getAllocatedWidth() / Math.max(1, values.length) }
  }

  area.setDrawFunc((_area, cr, width, height) => {
    const ctx = asCairoContext(cr)
    const max = Math.max(1, ...values.flatMap(({ income, expense }) => [income, expense]))
    const groupWidth = width / Math.max(1, values.length)
    const baseline = height - 24
    const chartHeight = baseline - 12

    for (const [index, value] of values.entries()) {
      const center = groupWidth * (index + 0.5)
      const incomeHeight = chartHeight * value.income / max
      const expenseHeight = chartHeight * value.expense / max
      ctx.setSourceRgb(...INCOME_COLOR)
      ctx.rectangle(center - BAR_WIDTH - BAR_GAP / 2, baseline - incomeHeight, BAR_WIDTH, incomeHeight)
      ctx.fill()
      ctx.setSourceRgb(...EXPENSE_COLOR)
      ctx.rectangle(center + BAR_GAP / 2, baseline - expenseHeight, BAR_WIDTH, expenseHeight)
      ctx.fill()
    }
  })

  const popover = new Gtk.Popover({
    autohide: false,
    hasArrow: true,
    position: Gtk.PositionType.TOP,
    cssClasses: ['budget-details'],
  })
  popover.setParent(area)

  let timer: NodeJS.Timeout | undefined
  let activeBar: string | undefined
  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }
  const close = () => {
    cancel()
    activeBar = undefined
    popover.popdown()
  }

  const barAt = (x: number, y: number): { month: MonthlyTotals, income: boolean } | undefined => {
    const { max, baseline, chartHeight, groupWidth } = geometry()
    const index = Math.floor(x / groupWidth)
    const month = values[index]
    if (!month) return undefined

    const center = groupWidth * (index + 0.5)
    const incomeHeight = chartHeight * month.income / max
    const expenseHeight = chartHeight * month.expense / max
    if (x >= center - BAR_WIDTH - BAR_GAP / 2 && x <= center - BAR_GAP / 2
      && y >= baseline - incomeHeight && y <= baseline) {
      return { month, income: true }
    }
    if (x >= center + BAR_GAP / 2 && x <= center + BAR_WIDTH + BAR_GAP / 2
      && y >= baseline - expenseHeight && y <= baseline) {
      return { month, income: false }
    }
    return undefined
  }

  const motion = new Gtk.EventControllerMotion()
  motion.on('motion', (x, y) => {
    const bar = barAt(x, y)
    if (!bar) {
      close()
      return
    }

    const key = `${bar.month.month}-${bar.income ? 'income' : 'expense'}`
    const pointingTo = new Gdk.Rectangle({
      x: Math.round(x),
      y: Math.round(y),
      width: 1,
      height: 1,
    })
    if (key === activeBar) {
      popover.pointingTo = pointingTo
      return
    }
    cancel()
    timer = setTimeout(() => {
      timer = undefined
      activeBar = key
      popover.pointingTo = pointingTo
      const label = bar.income ? t().historyView.income : t().historyView.expenses
      const amount = bar.income ? bar.month.income : bar.month.expense
      popover.setChild(new Gtk.Label({
        label: `${formatMonth(bar.month.month)}\n${label} : ${formatAmount(amount)}`,
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

  const legend = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 18 })
  legend.append(createLegendItem(t().historyView.income, INCOME_COLOR))
  legend.append(createLegendItem(t().historyView.expenses, EXPENSE_COLOR))

  const chartBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4 })
  chartBox.append(area)
  chartBox.append(labels)

  const scroller = new Gtk.ScrolledWindow({ hscrollbarPolicy: Gtk.PolicyType.AUTOMATIC, vexpand: true })
  scroller.setChild(chartBox)

  const root = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 18, marginTop: 24, marginStart: 24, marginEnd: 24, marginBottom: 24 })
  root.append(new Gtk.Label({ label: t().historyView.title, cssClasses: ['title-1'], xalign: 0 }))
  root.append(new Gtk.Label({ label: t().historyView.description, cssClasses: ['dim-label'], xalign: 0 }))
  root.append(legend)
  root.append(empty)
  root.append(scroller)

  return {
    widget: root,
    update: (next) => {
      close()
      values = next
      area.queueDraw()
      while (labels.getFirstChild()) labels.remove(labels.getFirstChild()!)
      for (const value of values) {
        const date = value.month
        const month = Number(date.slice(5, 7))
        labels.append(new Gtk.Label({ label: `${formatShortMonthName(month)} ${date.slice(0, 4)}`, widthRequest: CHART_WIDTH / Math.max(1, values.length) }))
      }
      empty.setLabel(values.length === 0 ? t().historyView.noData : '')
      empty.setVisible(values.length === 0)
      scroller.setVisible(values.length > 0)
    },
  }
}
