/* Optional system keyring bindings for the bank private key. */
export interface SecretNamespace {
  Schema: { new: (name: string, flags: number, attributes: Record<string, number>) => unknown }
  SchemaFlags: { NONE: number }
  SchemaAttributeType: { STRING: number }
  COLLECTION_DEFAULT: string
  passwordLookupSync?: (schema: unknown, attributes: Record<string, string>, cancellable: null) => string | null
  passwordStoreSync?: (
    schema: unknown,
    attributes: Record<string, string>,
    collection: string,
    label: string,
    password: string,
    cancellable: null,
  ) => boolean
  passwordClearSync?: (schema: unknown, attributes: Record<string, string>, cancellable: null) => boolean
}

export type SecretLoader = () => Promise<SecretNamespace>

export const loadSecretNamespace: SecretLoader = async () => {
  // The `gi:*` ambient module is typed loosely; the shape we rely on is above.
  const module = (await import('gi:Secret-1')) as unknown as { default: SecretNamespace }
  return module.default
}
