import { describe, expect, it } from 'vitest'
import { emptyConfigData, openConfig, sealConfig, webCryptoConfigCipher } from 'budget-lib'

import { nodeConfigCipher } from '../../src/data/node-config-cipher.js'

describe('nodeConfigCipher', () => {
  it('round-trips a configuration and is compatible with WebCrypto', async () => {
    const data = emptyConfigData()
    const text = await sealConfig(data, 'motdepasse123', nodeConfigCipher(), { iterations: 1000 })
    expect(await openConfig(text, 'motdepasse123', nodeConfigCipher())).toMatchObject(data)
    expect(await openConfig(text, 'motdepasse123', webCryptoConfigCipher(globalThis.crypto))).toMatchObject(data)
  })

  it('rejects a wrong passphrase', async () => {
    const text = await sealConfig(emptyConfigData(), 'motdepasse123', nodeConfigCipher(), { iterations: 1000 })
    await expect(openConfig(text, 'autre-mot-de-passe', nodeConfigCipher())).rejects.toMatchObject({ code: 'passphrase' })
  })
})
