/*
 * ui/passphrase.ts — what the passphrase dialog accepts, kept apart from the
 * widgets so the rule can be tested without GTK.
 */
import { isPassphraseAcceptable } from 'budget-lib'

/** The shortest passphrase the library seals a file with. */
export const MIN_PASSPHRASE_LENGTH = 8

export type PassphraseVerdict = 'ok' | 'too-short' | 'mismatch'

/**
 * `confirmation` is `undefined` when the dialog does not ask to type the
 * passphrase twice (opening a file): any non-empty entry is then accepted,
 * since the file itself decides whether it is right.
 */
export function checkPassphrase(passphrase: string, confirmation?: string): PassphraseVerdict {
  if (confirmation === undefined) return passphrase === '' ? 'too-short' : 'ok'
  if (!isPassphraseAcceptable(passphrase)) return 'too-short'
  return passphrase === confirmation ? 'ok' : 'mismatch'
}
