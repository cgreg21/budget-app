/*
 * ui/dialogs/recurrence-dialog.ts — the "new / edit recurrence" form.
 *
 * A recurrence describes a transaction that comes back: the top group is the
 * transaction itself, the bottom one its rhythm — how often, on which day, and
 * from which month on.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import {
  DEFAULT_CATEGORY_ICON,
  FALLBACK_CATEGORY,
  type Category,
} from '../../domain/category.js'
import {
  clampMonth,
  LAST_MONTH,
  FIRST_MONTH,
  monthKeyFrom,
  monthNumberOf,
  yearOf,
  type MonthKey,
} from '../../domain/month.js'
import {
  FIRST_DAY,
  LAST_DAY,
  RECURRENCE_FREQUENCIES,
  type Recurrence,
  type RecurrenceInput,
} from '../../domain/recurrence.js'
import type { TransactionKind } from '../../domain/transaction.js'
import { t } from '../../i18n/index.js'
import { formatFrequency, formatMonthName } from '../format.js'
import type { AdwSpinRow, GtkAdjustment, GtkWidget } from '../gtk-types.js'
import { createCategoryCombo } from './category-combo.js'
import { openFormDialog } from './form-dialog.js'
import { createOccurrenceCountField } from './occurrence-count-field.js'

const DIALOG_WIDTH = 460
const DIALOG_HEIGHT = 720
const MAX_AMOUNT = 1_000_000
const MONTHS_IN_YEAR = 12

export interface RecurrenceDialogOptions {
  categories: readonly Category[]
  /** Start month proposed for a new recurrence — the one on screen. Ignored when editing. */
  defaultMonth: MonthKey
  /** When provided, the dialog edits this recurrence instead of creating one. */
  recurrence?: Recurrence
  onSubmit(input: RecurrenceInput): void
}

interface RecurrenceForm {
  widget: GtkWidget
  /** The filled-in recurrence, or `null` while the form is not valid. */
  read(): RecurrenceInput | null
}

function defaultDescription(kind: TransactionKind): string {
  return t().recurrenceDialog.defaultDescription(kind)
}

function createSpinRow(title: string, subtitle: string, adjustment: GtkAdjustment): AdwSpinRow {
  return new Adw.SpinRow({ title, subtitle, adjustment })
}

function createForm(
  categories: readonly Category[],
  recurrence: Recurrence | undefined,
  defaultMonth: MonthKey,
): RecurrenceForm {
  const startMonth = recurrence?.startMonth ?? defaultMonth
  const strings = t().recurrenceDialog

  const transactionGroup = new Adw.PreferencesGroup({ title: strings.transactionGroupTitle })

  const kindToggle = new Adw.ToggleGroup({ homogeneous: true })
  kindToggle.add(new Adw.Toggle({ label: t().common.expense, name: 'expense' }))
  kindToggle.add(new Adw.Toggle({ label: t().common.income, name: 'income' }))
  kindToggle.setActiveName(recurrence?.kind ?? 'expense')

  const kindRow = new Adw.ActionRow({ title: strings.typeRow })
  kindRow.addSuffix(kindToggle)
  transactionGroup.add(kindRow)

  const descriptionRow = new Adw.EntryRow({
    title: strings.descriptionLabel,
    text: recurrence?.description ?? '',
  })
  transactionGroup.add(descriptionRow)

  const amountRow = new Adw.SpinRow({
    title: strings.amountLabel,
    digits: 2,
    adjustment: new Gtk.Adjustment({
      lower: 0,
      upper: MAX_AMOUNT,
      stepIncrement: 1,
      pageIncrement: 10,
      value: recurrence?.amount ?? 0,
    }),
  })
  transactionGroup.add(amountRow)

  const category = createCategoryCombo(categories, recurrence?.category)
  transactionGroup.add(category.row)

  const rhythmGroup = new Adw.PreferencesGroup({
    title: strings.rhythmGroupTitle,
    description: strings.rhythmGroupDescription,
  })

  const frequencyRow = new Adw.ComboRow({
    title: t().common.frequency,
    model: Gtk.StringList.new(RECURRENCE_FREQUENCIES.map(formatFrequency)),
    selected: Math.max(0, RECURRENCE_FREQUENCIES.indexOf(recurrence?.frequency ?? 'monthly')),
  })
  rhythmGroup.add(frequencyRow)

  const dayRow = createSpinRow(strings.dayLabel, strings.daySubtitle,
    new Gtk.Adjustment({
      lower: FIRST_DAY,
      upper: LAST_DAY,
      stepIncrement: 1,
      pageIncrement: 5,
      value: recurrence?.day ?? 1,
    }))
  rhythmGroup.add(dayRow)

  const startMonthRow = new Adw.ComboRow({
    title: strings.startMonthLabel,
    model: Gtk.StringList.new(
      Array.from({ length: MONTHS_IN_YEAR }, (_unused, index) => formatMonthName(index + 1)),
    ),
    selected: monthNumberOf(startMonth) - 1,
  })
  rhythmGroup.add(startMonthRow)

  const startYearRow = createSpinRow(strings.startYearLabel, strings.startYearSubtitle,
    new Gtk.Adjustment({
      lower: yearOf(FIRST_MONTH),
      upper: yearOf(LAST_MONTH),
      stepIncrement: 1,
      pageIncrement: 10,
      value: yearOf(startMonth),
    }))
  rhythmGroup.add(startYearRow)

  const lengthField = createOccurrenceCountField(recurrence?.occurrences)
  for (const row of lengthField.rows) rhythmGroup.add(row)

  const page = new Adw.PreferencesPage()
  page.add(transactionGroup)
  page.add(rhythmGroup)

  return {
    widget: page,
    read: () => {
      const amount = amountRow.value
      if (amount <= 0) return null

      const kind = (kindToggle.getActiveName() ?? 'expense') as TransactionKind
      const description = descriptionRow.text.trim()

      return {
        description: description || defaultDescription(kind),
        category: category.read(),
        kind,
        amount,
        day: Math.round(dayRow.value),
        frequency: RECURRENCE_FREQUENCIES[frequencyRow.selected] ?? 'monthly',
        startMonth: clampMonth(monthKeyFrom(Math.round(startYearRow.value), startMonthRow.selected + 1)),
        occurrences: lengthField.read(),
      }
    },
  }
}

export function openRecurrenceDialog(
  parent: GtkWidget,
  { categories, defaultMonth, recurrence, onSubmit }: RecurrenceDialogOptions,
): void {
  const isEditing = recurrence !== undefined
  const availableCategories = categories.length > 0
    ? categories
    : [{ name: FALLBACK_CATEGORY, icon: DEFAULT_CATEGORY_ICON }]
  const form = createForm(availableCategories, recurrence, defaultMonth)

  openFormDialog(parent, {
    title: isEditing ? t().recurrenceDialog.editTitle : t().recurrenceDialog.newTitle,
    confirmLabel: isEditing ? t().common.save : t().common.add,
    content: form.widget,
    width: DIALOG_WIDTH,
    height: DIALOG_HEIGHT,
    onConfirm: () => {
      const input = form.read()
      if (!input) return false // invalid: the amount must be greater than zero
      onSubmit(input)
      return true
    },
  })
}
