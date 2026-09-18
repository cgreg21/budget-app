/*
 * ui/dialogs/transaction-dialog.ts — the "new / edit transaction" form.
 *
 * One dialog serves both cases: pass a `transaction` to pre-fill the fields
 * and switch the title and confirm button to their "edit" wording.
 *
 * The form also carries the repetition: choosing a frequency turns the
 * transaction into the first occurrence of a series, whose day and start month
 * are those of the transaction itself. What to do with an existing series is
 * decided by the caller — see the edit-scope dialog.
 */
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'

import {
  DEFAULT_CATEGORY_ICON,
  FALLBACK_CATEGORY,
  type Category,
} from '../../domain/category.js'
import {
  RECURRENCE_FREQUENCIES,
  type Recurrence,
  type RecurrenceFrequency,
  type RecurrenceSettings,
} from '../../domain/recurrence.js'
import type {
  Transaction,
  TransactionInput,
  TransactionKind,
} from '../../domain/transaction.js'
import { formatFrequency } from '../format.js'
import type { GtkWidget } from '../gtk-types.js'
import { onNotify } from '../widgets.js'
import { createCategoryCombo } from './category-combo.js'
import { openFormDialog } from './form-dialog.js'
import { createOccurrenceCountField } from './occurrence-count-field.js'

const DIALOG_WIDTH = 420
const DIALOG_HEIGHT = 660
const MAX_AMOUNT = 1_000_000

/** "Ponctuelle" first, then the recurring rhythms. */
const REPEAT_OPTIONS: readonly (RecurrenceFrequency | null)[] = [null, ...RECURRENCE_FREQUENCIES]
const REPEAT_LABELS = ['Ponctuelle', ...RECURRENCE_FREQUENCIES.map(formatFrequency)]

export interface TransactionSubmission {
  input: TransactionInput
  /** The series the transaction should follow; `null` when it is one-off. */
  recurrence: RecurrenceSettings | null
  /** True when the repetition was touched — frequency and length belong to the series. */
  recurrenceChanged: boolean
}

export interface TransactionDialogOptions {
  categories: readonly Category[]
  /** Date given to a new transaction, so it lands in the month on screen. Ignored when editing. */
  defaultDate: string
  /** When provided, the dialog edits this transaction instead of creating one. */
  transaction?: Transaction
  /** The series the edited transaction belongs to, if it still exists. */
  recurrence?: Recurrence
  onSubmit(submission: TransactionSubmission): void
}

interface TransactionForm {
  widget: GtkWidget
  /** The filled-in submission, or `null` when the form is not valid yet. */
  read(): TransactionSubmission | null
}

function defaultDescription(kind: TransactionKind): string {
  return kind === 'income' ? 'Revenu' : 'Dépense'
}

function createForm(
  categories: readonly Category[],
  transaction: Transaction | undefined,
  defaultDate: string,
  recurrence: Recurrence | undefined,
): TransactionForm {
  const group = new Adw.PreferencesGroup()

  const kindToggle = new Adw.ToggleGroup({ homogeneous: true })
  kindToggle.add(new Adw.Toggle({ label: 'Dépense', name: 'expense' }))
  kindToggle.add(new Adw.Toggle({ label: 'Revenu', name: 'income' }))
  kindToggle.setActiveName(transaction?.kind ?? 'expense')

  const kindRow = new Adw.ActionRow({ title: 'Type' })
  kindRow.addSuffix(kindToggle)
  group.add(kindRow)

  const descriptionRow = new Adw.EntryRow({
    title: 'Description',
    text: transaction?.description ?? '',
  })
  group.add(descriptionRow)

  const amountRow = new Adw.SpinRow({
    title: 'Montant (€)',
    digits: 2,
    adjustment: new Gtk.Adjustment({
      lower: 0,
      upper: MAX_AMOUNT,
      stepIncrement: 1,
      pageIncrement: 10,
      value: transaction?.amount ?? 0,
    }),
  })
  group.add(amountRow)

  const category = createCategoryCombo(categories, transaction?.category)
  group.add(category.row)

  const initialRepeat = Math.max(0, REPEAT_OPTIONS.indexOf(recurrence?.frequency ?? null))
  const repeatGroup = new Adw.PreferencesGroup({
    title: 'Répétition',
    description: 'Une transaction répétée est recréée automatiquement, le même jour, '
      + 'dans chaque mois concerné, dès son ouverture.',
  })
  const repeatRow = new Adw.ComboRow({
    title: 'Fréquence',
    model: Gtk.StringList.new(REPEAT_LABELS),
    selected: initialRepeat,
  })
  repeatGroup.add(repeatRow)

  const initialOccurrences = recurrence?.occurrences
  const lengthField = createOccurrenceCountField(initialOccurrences)
  for (const row of lengthField.rows) repeatGroup.add(row)

  // A length only means something once a rhythm is chosen.
  const refreshLength = () => lengthField.setEnabled(REPEAT_OPTIONS[repeatRow.selected] !== null)
  onNotify(repeatRow, 'selected', refreshLength)
  refreshLength()

  const page = new Adw.PreferencesPage()
  page.add(group)
  page.add(repeatGroup)

  return {
    widget: page,
    read: () => {
      const amount = amountRow.value
      if (amount <= 0) return null

      const kind = (kindToggle.getActiveName() ?? 'expense') as TransactionKind
      const description = descriptionRow.text.trim()
      const frequency = REPEAT_OPTIONS[repeatRow.selected] ?? null
      const occurrences = lengthField.read()

      return {
        input: {
          date: transaction?.date ?? defaultDate,
          description: description || defaultDescription(kind),
          category: category.read(),
          kind,
          amount,
          // Kept so an edited occurrence stays tied to its recurrence and is not
          // written a second time when the month is opened again.
          recurrenceId: transaction?.recurrenceId,
        },
        recurrence: frequency === null ? null : { frequency, occurrences },
        recurrenceChanged:
          repeatRow.selected !== initialRepeat ||
          (frequency !== null && occurrences !== initialOccurrences),
      }
    },
  }
}

export function openTransactionDialog(
  parent: GtkWidget,
  { categories, defaultDate, transaction, recurrence, onSubmit }: TransactionDialogOptions,
): void {
  const isEditing = transaction !== undefined
  const availableCategories = categories.length > 0
    ? categories
    : [{ name: FALLBACK_CATEGORY, icon: DEFAULT_CATEGORY_ICON }]
  const form = createForm(availableCategories, transaction, defaultDate, recurrence)

  openFormDialog(parent, {
    title: isEditing ? 'Modifier la transaction' : 'Nouvelle transaction',
    confirmLabel: isEditing ? 'Enregistrer' : 'Ajouter',
    content: form.widget,
    width: DIALOG_WIDTH,
    height: DIALOG_HEIGHT,
    onConfirm: () => {
      const submission = form.read()
      if (!submission) return false // invalid: the amount must be greater than zero
      onSubmit(submission)
      return true
    },
  })
}
