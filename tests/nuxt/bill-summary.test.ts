import { describe, expect, it } from 'vitest'
import type { InternalApi } from 'nitropack/types'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import BillSummary from '~/components/fees/BillSummary.vue'

type Bill = NonNullable<InternalApi['/api/students/:id/fees']['get']['bill']>

const bill = (balance: number, overrides: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  termId: 't1',
  classArmId: 'a1',
  lines: [
    { id: 'l1', feeItemId: 'f1', kind: 'item', description: 'Tuition', amountKobo: 8_500_000 },
    { id: 'l2', feeItemId: null, kind: 'carry_forward', description: 'Arrears brought forward (Third Term 2025/2026)', amountKobo: 1_000_000 },
  ],
  optionalItems: [],
  discounts: [{ id: 'd1', kind: 'percent', value: 1000, reason: 'Sibling discount', amountKobo: 850_000 }],
  payments: [
    { id: 'p1', receiptNumber: 'RCT/2026/000001', amountKobo: 5_000_000, method: 'transfer', reference: 'TRF1', paidOn: '2026-10-01', receivedBy: 'Fatima Bello', reversedAt: null, reversalReason: null, reversed: false },
    { id: 'p2', receiptNumber: 'RCT/2026/000002', amountKobo: 1_000_000, method: 'cash', reference: null, paidOn: '2026-10-02', receivedBy: 'Fatima Bello', reversedAt: '2026-10-03T10:00:00.000Z', reversalReason: 'Wrong student', reversed: true },
  ],
  totals: { itemsTotal: 8_500_000, carryForward: 1_000_000, discountTotal: 850_000, billed: 9_500_000, paid: 5_000_000, reversed: 1_000_000, balance },
  ...overrides,
})

describe('BillSummary', () => {
  it('lists the lines, the discount and the totals, with an owing balance in red', async () => {
    const wrapper = await mountSuspended(BillSummary, { props: { bill: bill(3_650_000) } })
    const rows = wrapper.findAll('[data-testid=bill-lines] tr').map(r => r.text())
    expect(rows[0]).toBe('Tuition₦85,000.00')
    expect(rows[1]).toContain('Arrears brought forward')
    expect(wrapper.get('[data-testid=bill-discount]').text()).toContain('Sibling discount (10%)')
    expect(wrapper.get('[data-testid=bill-discount]').text()).toContain('−₦8,500.00')
    const balance = wrapper.get('[data-testid=bill-balance]')
    expect(balance.text()).toBe('₦36,500.00')
    expect(balance.classes()).toContain('text-error')
  })

  it('shows credit in green and a settled bill as fully paid', async () => {
    const credit = await mountSuspended(BillSummary, { props: { bill: bill(-500_000) } })
    expect(credit.get('[data-testid=bill-balance]').text()).toBe('₦5,000.00')
    expect(credit.get('[data-testid=bill-balance]').classes()).toContain('text-success')
    expect(credit.text()).toContain('Credit')
    const settled = await mountSuspended(BillSummary, { props: { bill: bill(0) } })
    expect(settled.get('[data-testid=bill-balance]').text()).toBe('Fully paid')
  })

  it('marks reversed payments and offers Reverse only on the others, when editing is allowed', async () => {
    const wrapper = await mountSuspended(BillSummary, { props: { bill: bill(3_650_000), canEdit: true } })
    expect(wrapper.get('[data-testid="payment-RCT/2026/000002"]').text()).toContain('Reversed')
    expect(wrapper.get('[data-testid="payment-RCT/2026/000002"]').text()).toContain('Wrong student')
    expect(wrapper.find('[data-testid="reverse-RCT/2026/000002"]').exists()).toBe(false)
    await wrapper.get('[data-testid="reverse-RCT/2026/000001"]').trigger('click')
    expect(wrapper.emitted('reverse')).toEqual([['p1']])

    const readOnly = await mountSuspended(BillSummary, { props: { bill: bill(3_650_000) } })
    expect(readOnly.find('[data-testid="reverse-RCT/2026/000001"]').exists()).toBe(false)
    expect(readOnly.find('[data-testid="receipt-RCT/2026/000001"]').exists()).toBe(true)
  })
})
