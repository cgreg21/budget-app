/*
 * ui/types.ts — the small contracts every view in this app follows.
 */
import type { GtkWidget } from './gtk-types.js'

/** Shows a transient message to the user (implemented with Adw.Toast). */
export type Notify = (message: string) => void

/** Same, with an action button on the toast (e.g. "Undo"). */
export type NotifyAction = (message: string, actionLabel: string, onAction: () => void) => void

/** A widget together with the function that refreshes it from a value. */
export interface Component<T> {
  readonly widget: GtkWidget
  update(value: T): void
}

/** A widget holding subscriptions that must be released when it goes away. */
export interface DisposableComponent {
  readonly widget: GtkWidget
  dispose(): void
}
