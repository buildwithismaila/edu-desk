import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import Invoice from '~/components/fees/Invoice.vue'
import BankAccountsEditor from '~/components/settings/BankAccountsEditor.vue'

const invoice = (overrides = {}) => ({
  billId: 'b1',
  school: { name: 'Greenfield Academy', address: '14 Adeola Odeku Street', phone: null, email: null, logoUrl: null, bankAccounts: [{ bankName: 'Zenith Bank', accountName: 'Greenfield Academy', accountNumber: '1012345678' }] },
  student: { name: 'Ada Obi', admissionNumber: 'GFA/2026/0001' },
  classLabel: 'JSS 1A',
  term: 'First Term 2026/2027',
  issuedOn: '2026-10-14',
  lines: [
    { kind: 'item', description: 'Tuition', amountKobo: 8_500_000 },
    { kind: 'carry_forward', description: 'Arrears brought forward (Third Term 2025/2026)', amountKobo: 3_250_000 },
  ],
  discounts: [{ reason: 'Sibling discount', amountKobo: 500_000 }],
  totals: { itemsTotal: 8_500_000, carryForward: 3_250_000, discountTotal: 500_000, billed: 11_750_000, paid: 3_000_000, reversed: 0, balance: 8_250_000 },
  ...overrides,
})

describe('Invoice', () => {
  it('shows the bill, the balance due and how to pay with the admission number as reference', async () => {
    const wrapper = await mountSuspended(Invoice, { props: { invoice: invoice() as never } })

    expect(wrapper.text()).toContain('School fees invoice · First Term 2026/2027')
    expect(wrapper.get('[data-testid=invoice-student]').text()).toBe('Ada Obi')
    expect(wrapper.text()).toContain('Arrears brought forward (Third Term 2025/2026)')
    expect(wrapper.text()).toContain('Discount: Sibling discount')
    expect(wrapper.text()).toContain('−₦5,000.00')
    expect(wrapper.get('[data-testid=invoice-balance]').text()).toBe('₦82,500.00')
    expect(wrapper.get('[data-testid=invoice-bank]').text()).toContain('Zenith Bank · Greenfield Academy · 1012345678')
    expect(wrapper.get('[data-testid=invoice-reference]').text()).toContain('GFA/2026/0001')
  })

  it('shows credit and fully paid, and leaves out "How to pay" without bank accounts', async () => {
    const credit = await mountSuspended(Invoice, { props: { invoice: invoice({ totals: { ...invoice().totals, balance: -200_000 } }) as never } })
    expect(credit.text()).toContain('Credit')
    expect(credit.get('[data-testid=invoice-balance]').text()).toBe('₦2,000.00')

    const paid = await mountSuspended(Invoice, { props: { invoice: invoice({ totals: { ...invoice().totals, balance: 0 }, school: { ...invoice().school, bankAccounts: [] } }) as never } })
    expect(paid.get('[data-testid=invoice-balance]').text()).toBe('Fully paid')
    expect(paid.find('[data-testid=invoice-bank]').exists()).toBe(false)
  })
})

describe('BankAccountsEditor', () => {
  it('adds up to two accounts', async () => {
    const wrapper = await mountSuspended(BankAccountsEditor, { props: { accounts: [] } })
    expect(wrapper.text()).toContain('No bank accounts yet')

    await wrapper.get('[data-testid=bank-account-add]').trigger('click')
    await wrapper.get('[data-testid=bank-account-add]').trigger('click')
    expect(wrapper.findAll('[data-testid^=bank-account-]').filter(e => /bank-account-\d/.test(e.attributes('data-testid')!))).toHaveLength(2)
    expect(wrapper.find('[data-testid=bank-account-add]').exists()).toBe(false)
  })
})
