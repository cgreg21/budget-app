/*
 * ui/views/month-switcher.ts — the month navigator shown as the header bar
 * title: « ‹ | Septembre 2026 ▾ | › ».
 *
 * The arrows step one month at a time anywhere in the navigable range, and the
 * drop-down is a picker: a year stepper above a grid of the twelve months. A
 * dot marks the months that already hold transactions, so the history stays
 * visible while empty months remain reachable — their file is only created
 * when a transaction is added to them.
 */
import Gtk from 'gi:Gtk-4.0'

import {
  currentMonthKey,
  FIRST_MONTH,
  LAST_MONTH,
  monthKeyFrom,
  yearOf,
  type MonthKey,
} from '../../domain/month.js'
import { formatMonth, formatShortMonthName } from '../format.js'
import type { GtkButton, GtkLabel } from '../gtk-types.js'
import type { Component } from '../types.js'

const MONTHS_IN_YEAR = 12
const PICKER_COLUMNS = 3
const PICKER_WIDTH = 260

const FIRST_YEAR = yearOf(FIRST_MONTH)
const LAST_YEAR = yearOf(LAST_MONTH)

export interface MonthSwitcherState {
  selected: MonthKey
  /** The month "today" falls in, offered as a shortcut back. */
  current: MonthKey
  /** Months that already have a file; flagged with a dot in the picker. */
  monthsWithData: readonly MonthKey[]
  hasOlder: boolean
  hasNewer: boolean
}

export interface MonthSwitcherActions {
  onSelectOlder(): void
  onSelectNewer(): void
  onSelect(month: MonthKey): void
}

/** One cell of the picker grid; its label never changes, its styling does. */
interface MonthCell {
  button: GtkButton
  marker: GtkLabel
}

function createArrowButton(iconName: string, tooltip: string, onClick: () => void): GtkButton {
  const button = new Gtk.Button({ iconName, tooltipText: tooltip, cssClasses: ['flat'] })
  button.on('clicked', onClick)
  return button
}

function createMonthCell(monthNumber: number, onActivate: () => void): MonthCell {
  const name = new Gtk.Label({ label: formatShortMonthName(monthNumber) })
  // Always present, only faded out: a hidden dot would make the grid jump.
  const marker = new Gtk.Label({ label: '•', cssClasses: ['month-marker'], opacity: 0 })

  const content = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    halign: Gtk.Align.CENTER,
  })
  content.append(name)
  content.append(marker)

  const button = new Gtk.Button({ cssClasses: ['flat'], hexpand: true })
  button.setChild(content)
  button.on('clicked', onActivate)

  return { button, marker }
}

export function createMonthSwitcher(actions: MonthSwitcherActions): Component<MonthSwitcherState> {
  let state: MonthSwitcherState = {
    selected: currentMonthKey(),
    current: currentMonthKey(),
    monthsWithData: [],
    hasOlder: true,
    hasNewer: true,
  }
  let pickerYear = yearOf(state.selected)

  const olderButton = createArrowButton('go-previous-symbolic', 'Mois précédent', actions.onSelectOlder)
  const newerButton = createArrowButton('go-next-symbolic', 'Mois suivant', actions.onSelectNewer)

  const popover = new Gtk.Popover()
  const monthButton = new Gtk.MenuButton({
    popover,
    cssClasses: ['flat'],
    tooltipText: 'Choisir un mois',
  })

  const container = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 2 })
  container.append(olderButton)
  container.append(monthButton)
  container.append(newerButton)

  const pick = (month: MonthKey) => {
    popover.popdown()
    actions.onSelect(month)
  }

  const showYear = (year: number) => {
    pickerYear = Math.min(Math.max(year, FIRST_YEAR), LAST_YEAR)
    refreshPicker()
  }

  const previousYearButton = createArrowButton(
    'go-previous-symbolic',
    'Année précédente',
    () => showYear(pickerYear - 1),
  )
  const nextYearButton = createArrowButton(
    'go-next-symbolic',
    'Année suivante',
    () => showYear(pickerYear + 1),
  )
  const yearLabel = new Gtk.Label({ cssClasses: ['heading'], hexpand: true })

  const yearRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
  yearRow.append(previousYearButton)
  yearRow.append(yearLabel)
  yearRow.append(nextYearButton)

  const grid = new Gtk.Grid({ rowSpacing: 4, columnSpacing: 4, columnHomogeneous: true })
  const cells: MonthCell[] = []
  for (let monthNumber = 1; monthNumber <= MONTHS_IN_YEAR; monthNumber += 1) {
    const cell = createMonthCell(monthNumber, () => pick(monthKeyFrom(pickerYear, monthNumber)))
    const index = monthNumber - 1
    grid.attach(cell.button, index % PICKER_COLUMNS, Math.floor(index / PICKER_COLUMNS), 1, 1)
    cells.push(cell)
  }

  const todayButton = new Gtk.Button({ label: 'Aller au mois courant', cssClasses: ['flat'] })
  todayButton.on('clicked', () => pick(state.current))

  const pickerContent = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 6,
    marginTop: 6,
    marginBottom: 6,
    marginStart: 6,
    marginEnd: 6,
    widthRequest: PICKER_WIDTH,
  })
  pickerContent.append(yearRow)
  pickerContent.append(grid)
  pickerContent.append(new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL }))
  pickerContent.append(todayButton)
  popover.setChild(pickerContent)

  function refreshPicker(): void {
    yearLabel.setLabel(String(pickerYear))
    previousYearButton.setSensitive(pickerYear > FIRST_YEAR)
    nextYearButton.setSensitive(pickerYear < LAST_YEAR)
    todayButton.setSensitive(state.selected !== state.current)

    const withData = new Set(state.monthsWithData)
    cells.forEach((cell, index) => {
      const month = monthKeyFrom(pickerYear, index + 1)
      const isSelected = month === state.selected
      const hasData = withData.has(month)

      cell.button.setCssClasses(styleClassesFor(isSelected, month === state.current))
      cell.button.setTooltipText(hasData
        ? `${formatMonth(month)} — contient des transactions`
        : formatMonth(month))
      cell.marker.setCssClasses(isSelected ? ['month-marker', 'month-marker-selected'] : ['month-marker'])
      cell.marker.setOpacity(hasData ? 1 : 0)
    })
  }

  // Reopening the picker always lands on the month being displayed.
  popover.on('map', () => showYear(yearOf(state.selected)))

  return {
    widget: container,
    update: (next) => {
      state = next
      monthButton.setLabel(formatMonth(state.selected))
      olderButton.setSensitive(state.hasOlder)
      newerButton.setSensitive(state.hasNewer)
      if (!popover.getVisible()) pickerYear = yearOf(state.selected)
      refreshPicker()
    },
  }
}

function styleClassesFor(isSelected: boolean, isCurrent: boolean): string[] {
  if (isSelected) return ['suggested-action']
  return isCurrent ? ['flat', 'month-current'] : ['flat']
}
