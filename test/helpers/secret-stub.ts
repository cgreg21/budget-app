/*
 * test/helpers/secret-stub.ts — stands in for `gi:Secret-1` under Vitest.
 *
 * `data/remote/credentials.ts` loads libsecret with a dynamic `import()`, so
 * that a session without the typelib degrades to the environment instead of
 * crashing. Aliasing the namespace to this stub (see vitest.config.ts) lets
 * the default loader be exercised on a machine that has no keyring at all,
 * while the tests that need a *missing* typelib keep injecting their own
 * loader.
 *
 * The keyring is a plain map here, keyed the way libsecret keys it: by the
 * attribute set, not by the schema.
 */
export const COLLECTION_DEFAULT = 'default'

const passwords = new Map<string, string>()

function keyOf(attributes: Record<string, string>): string {
  return JSON.stringify(Object.entries(attributes).sort())
}

const Secret = {
  Schema: {
    new(name: string, _flags: number, _attributes: Record<string, number>): unknown {
      return { name }
    },
  },
  SchemaFlags: { NONE: 0 },
  SchemaAttributeType: { STRING: 0 },
  COLLECTION_DEFAULT,

  passwordLookupSync(_schema: unknown, attributes: Record<string, string>, _cancellable: null): string | null {
    return passwords.get(keyOf(attributes)) ?? null
  },

  passwordStoreSync(
    _schema: unknown,
    attributes: Record<string, string>,
    _collection: string,
    _label: string,
    password: string,
    _cancellable: null,
  ): boolean {
    passwords.set(keyOf(attributes), password)
    return true
  },

  passwordClearSync(_schema: unknown, attributes: Record<string, string>, _cancellable: null): boolean {
    return passwords.delete(keyOf(attributes))
  },
}

/** Empties the stubbed keyring between tests. */
export function clearStubbedKeyring(): void {
  passwords.clear()
}

export default Secret
