/*
 * Covers the dependencies the bank service falls back to when none are
 * injected: Node's HTTP transport and signer (mocked here so no request leaves
 * the machine), the loopback listener and the system clock.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { defaultBankState, type Aspsp, type BankState } from 'budget-lib'

vi.mock('../../../src/data/bank/node-bank.js', () => ({
  nodeBankHttp: vi.fn(async () => ({ status: 200, body: '{"url":"https://bank.example/auth"}' })),
  rsaSigner: vi.fn(() => 'jwt'),
}))

import { nodeBankHttp, rsaSigner } from '../../../src/data/bank/node-bank.js'
import { BankService, type BankNotice } from '../../../src/data/bank/bank-service.js'

const PEM = '-----BEGIN PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----\n'
const BANK: Aspsp = { name: 'Crédit Mutuel de Bretagne', country: 'FR', maximumConsentSeconds: 90 * 24 * 3600 }

function service(redirectUrl: string, applicationId: string) {
  const state = { bank: { ...defaultBankState('2026-09-15', redirectUrl), config: { ...defaultBankState('2026-09-15', redirectUrl).config, applicationId } } }
  const openUrl = vi.fn()
  const notices: BankNotice[] = []
  const bank = new BankService({
    state: { get bank() { return state.bank }, save: (next: BankState) => { state.bank = next } },
    keys: { load: async (id) => (id === 'app' ? PEM : ''), save: async () => true, remove: async () => {} },
    categories: () => [],
    importTransactions: () => 0,
    openUrl,
    language: () => 'fr',
  })
  bank.onStatusChange(({ notice }) => { if (notice !== null) notices.push(notice) })
  return { bank, openUrl, notices }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('BankService defaults', () => {
  it('asks for the credentials before connecting', async () => {
    const { bank, openUrl, notices } = service('https://example.org/bank', '')

    await bank.connect(BANK)

    expect(notices).toEqual([{ code: 'missing-credentials' }])
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('uses Node HTTP, the RSA signer and the loopback listener', async () => {
    const { bank, openUrl, notices } = service('https://example.org/bank', 'app')

    await bank.connect(BANK)

    expect(nodeBankHttp).toHaveBeenCalled()
    expect(rsaSigner).toHaveBeenCalled()
    expect(openUrl).toHaveBeenCalledWith('https://bank.example/auth')
    // A public return address cannot be listened to locally: the user pastes it.
    expect(notices.at(-1)).toEqual({ code: 'waiting', listening: false })
    bank.dispose()
  })

  it('reads the system clock', () => {
    const { bank } = service('https://example.org/bank', 'app')

    expect(bank.expired).toBe(false)
  })
})
