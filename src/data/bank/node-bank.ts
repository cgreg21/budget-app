/*
 * data/bank/node-bank.ts — the two things the bank client needs from the
 * platform: an HTTP transport and an RS256 signature.
 *
 * Both are Node's own (`fetch`, `node:crypto`); the protocol itself lives in
 * budget-lib and is shared with the mobile app.
 */
import { createSign } from 'node:crypto'

import type { BankHttp, JwtSigner } from 'budget-lib'

/** Resolves for any HTTP status, rejects only when nothing answered — what the client expects. */
export const nodeBankHttp: BankHttp = async ({ method, url, headers, body, timeoutMs }) => {
  const response = await fetch(url, {
    method,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    ...(body === undefined ? {} : { body }),
  })
  return { status: response.status, body: await response.text() }
}

const base64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')

export const rsaSigner: JwtSigner = (header, payload, privateKey) => {
  const signingInput = `${base64url(header)}.${base64url(payload)}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey, 'base64url')
  return `${signingInput}.${signature}`
}
