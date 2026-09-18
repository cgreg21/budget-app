/*
 * ui/views/transaction-filters.ts — the strip above the transaction list:
 * a search field, a "type" drop down, a "categories" menu and a reset button.
 *
 * It holds no transactions of its own. It only reports what the list should
 * keep, and the list does the narrowing — so the filter never touches the
 * month's data, and the totals and charts keep describing the whole month
 * rather than whatever is on screen.
 *
 * Categories are picked several at a time, which rules out a drop down: GTK
 * has no multi-select one. A menu button holding a check box per category
 * does the job, and its label reports the choice so the popover does not have
 * to be opened to see what is filtered.
 */
import Gtk from 'gi:Gtk-4.0'

import type { Category } from '../../domain/category.js'
import {
  isFilterActive,
  NO_FILTER,
  type TransactionFilter,
  type TransactionKind,
} from '../../domain/transaction.js'
import { t } from '../../i18n/index.js'
import type { GtkCheckButton, GtkWidget } from '../gtk-types.js'
import { clearBox, onNotify } from '../widgets.js'

/** Kind entries, in order. `null` is "all kinds" and is the resting choice. */
const KINDS: readonly (TransactionKind | null)[] = [null, 'income', 'expense']
const kindLabels = () => [t().transactionFilters.kindAll, t().transactionFilters.kindIncome, t().transactionFilters.kindExpense]

/** Past this, the category list scrolls inside the popover. */
const CATEGORY_LIST_MAX_HEIGHT = 320

export interface TransactionFilters {
  widget: GtkWidget
  /** Rebuilds the category check list, keeping the ticks that survived. */
  setCategories(categories: readonly Category[]): void
}

function sameFilter(a: TransactionFilter, b: TransactionFilter): boolean {
  return (
    a.search === b.search
    && a.kind === b.kind
    && a.categories.length === b.categories.length
    && a.categories.every((name, index) => name === b.categories[index])
  )
}

export function createTransactionFilters(
  onChange: (filter: TransactionFilter) => void,
): TransactionFilters {
  const search = new Gtk.SearchEntry({
    placeholderText: t().transactionFilters.searchPlaceholder,
    hexpand: true,
  })

  const kindDrop = new Gtk.DropDown({
    model: Gtk.StringList.new(kindLabels()),
    selected: 0,
    tooltipText: t().transactionFilters.kindTooltip,
  })

  const checkList = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 6,
    marginTop: 6,
    marginBottom: 6,
    marginStart: 6,
    marginEnd: 6,
  })

  // Natural height up to a ceiling: a handful of categories gives a compact
  // popover, forty of them a scrollable one rather than a full-screen menu.
  const checkScroller = new Gtk.ScrolledWindow({
    propagateNaturalHeight: true,
    maxContentHeight: CATEGORY_LIST_MAX_HEIGHT,
    hscrollbarPolicy: Gtk.PolicyType.NEVER,
  })
  checkScroller.setChild(checkList)

  const categoryPopover = new Gtk.Popover()
  categoryPopover.setChild(checkScroller)

  const categoryButton = new Gtk.MenuButton({
    label: t().transactionFilters.anyCategory,
    tooltipText: t().transactionFilters.categoryTooltip,
    popover: categoryPopover,
  })

  // Insensitive while nothing is filtered: the button then doubles as a hint
  // that the list on screen is the whole month.
  const reset = new Gtk.Button({
    iconName: 'edit-clear-symbolic',
    tooltipText: t().transactionFilters.resetTooltip,
    cssClasses: ['flat'],
    sensitive: false,
  })

  /** One check box per category, in the order the store hands them over. */
  let checks: { name: string, check: GtkCheckButton }[] = []

  // The last filter handed out. Compared against rather than trusting the
  // signals: GTK delays `search-changed`, so clearing every field would
  // otherwise rebuild the list a second time once the delay elapsed.
  let current: TransactionFilter = NO_FILTER

  // Raised while several widgets are set in a row — a reset, or a rebuild of
  // the check list. Every signal it silences is synchronous, so the flag is
  // down again before anything else gets to run; the delayed `search-changed`
  // is left to the comparison above.
  let silent = false

  const ticked = () => checks.filter(({ check }) => check.active).map(({ name }) => name)

  const showChoice = (categories: readonly string[]) => {
    if (categories.length === 0) categoryButton.setLabel(t().transactionFilters.anyCategory)
    else if (categories.length === 1) categoryButton.setLabel(categories[0] ?? t().transactionFilters.anyCategory)
    else categoryButton.setLabel(t().transactionFilters.categoriesCount(categories.length))
  }

  const changed = () => {
    if (silent) return

    const next: TransactionFilter = {
      search: search.text,
      kind: KINDS[kindDrop.selected] ?? null,
      categories: ticked(),
    }
    if (sameFilter(next, current)) return

    current = next
    showChoice(next.categories)
    reset.setSensitive(isFilterActive(next))
    onChange(next)
  }

  // `search-changed` rather than `changed`: GTK waits for a pause in the
  // typing, so the list is not rebuilt on every keystroke.
  search.on('search-changed', changed)
  onNotify(kindDrop, 'selected', changed)

  reset.on('clicked', () => {
    silent = true
    search.text = ''
    kindDrop.selected = 0
    for (const { check } of checks) check.active = false
    silent = false
    changed()
  })

  const setCategories = (categories: readonly Category[]) => {
    const names = categories.map((category) => category.name)
    if (names.length === checks.length && names.every((name, i) => name === checks[i]?.name)) return

    // A rename or a deletion takes its tick away with it — there is nothing
    // left to filter on.
    const kept = new Set(ticked())

    silent = true
    clearBox(checkList)
    checks = names.map((name) => {
      const check = new Gtk.CheckButton({ label: name, active: kept.has(name) })
      check.on('toggled', changed)
      checkList.append(check)
      return { name, check }
    })
    silent = false

    changed()
  }

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 6,
    marginStart: 12,
    marginEnd: 12,
    marginBottom: 12,
  })
  box.append(search)
  box.append(kindDrop)
  box.append(categoryButton)
  box.append(reset)

  return { widget: box, setCategories }
}
