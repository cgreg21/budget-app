/*
 * data/node-config-cipher.ts — the cipher of the configuration file on top of
 * node:crypto, using its synchronous calls.
 *
 * WebCrypto and the asynchronous node:crypto functions finish on Node's thread
 * pool, whose completion is not reliably delivered while the GTK main loop
 * drives the process: the promise could stay pending and the import then did
 * nothing at all. The synchronous calls take about 100 ms, once per file.
 */
import { createCipheriv, createDecipheriv, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'

import type { ConfigCipher } from 'budget-lib'

export function nodeConfigCipher(): ConfigCipher {
  return {
    randomBytes: (length) => new Uint8Array(randomBytes(length)),
    pbkdf2Sha256: (passphrase, salt, iterations, length) =>
      Promise.resolve(new Uint8Array(pbkdf2Sync(passphrase, salt, iterations, length, 'sha256'))),
    aesCbcEncrypt: (key, iv, plaintext) => {
      const cipher = createCipheriv('aes-256-cbc', key, iv)
      return Promise.resolve(new Uint8Array(Buffer.concat([cipher.update(plaintext), cipher.final()])))
    },
    aesCbcDecrypt: (key, iv, ciphertext) => {
      try {
        const decipher = createDecipheriv('aes-256-cbc', key, iv)
        return Promise.resolve(new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()])))
      } catch (error) {
        return Promise.reject(error)
      }
    },
    hmacSha256: (key, data) => Promise.resolve(new Uint8Array(createHmac('sha256', key).update(data).digest())),
  }
}
