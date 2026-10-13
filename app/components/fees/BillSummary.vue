<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import { PAYMENT_METHOD_LABELS } from '#shared/schemas/fees'

type Bill = NonNullable<InternalApi['/api/students/:id/fees']['get']['bill']>

// A term bill: lines, discounts, payments (reversed ones marked) and the totals; actions are emitted.
const props = defineProps<{ bill: Bill, canEdit?: boolean }>()
const emit = defineEmits<{ receipt: [paymentId: string], reverse: [paymentId: string], removeDiscount: [discountId: string] }>()

const t = computed(() => props.bill.totals)
</script>

<template>
  <div class="space-y-4">
    <table
      data-testid="bill-lines"
      class="w-full text-sm"
    >
      <tbody>
        <tr
          v-for="line in bill.lines"
          :key="line.id"
          class="border-b border-default"
        >
          <td class="py-1.5">
            {{ line.description }}
          </td>
          <td class="py-1.5 text-right tabular-nums">
            {{ formatNaira(line.amountKobo) }}
          </td>
        </tr>
        <tr
          v-for="discount in bill.discounts"
          :key="discount.id"
          data-testid="bill-discount"
          class="border-b border-default text-success"
        >
          <td class="py-1.5">
            Discount: {{ discount.reason }}{{ discount.kind === 'percent' ? ` (${discount.value / 100}%)` : '' }}
            <UButton
              v-if="canEdit"
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              :aria-label="`Remove discount ${discount.reason}`"
              @click="emit('removeDiscount', discount.id)"
            />
          </td>
          <td class="py-1.5 text-right tabular-nums">
            −{{ formatNaira(discount.amountKobo) }}
          </td>
        </tr>
      </tbody>
    </table>

    <dl class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      <div>
        <dt class="text-muted">
          Billed
        </dt>
        <dd class="font-medium tabular-nums">
          {{ formatNaira(t.billed - t.discountTotal) }}
        </dd>
      </div>
      <div>
        <dt class="text-muted">
          Paid
        </dt>
        <dd class="font-medium tabular-nums">
          {{ formatNaira(t.paid) }}
        </dd>
      </div>
      <div class="col-span-2 sm:col-span-2">
        <dt class="text-muted">
          {{ t.balance < 0 ? 'Credit' : 'Balance' }}
        </dt>
        <dd
          data-testid="bill-balance"
          class="text-lg font-semibold tabular-nums"
          :class="t.balance > 0 ? 'text-error' : t.balance < 0 ? 'text-success' : ''"
        >
          {{ t.balance === 0 ? 'Fully paid' : formatNaira(Math.abs(t.balance)) }}
        </dd>
      </div>
    </dl>

    <div>
      <h3 class="mb-1 text-sm font-medium text-muted">
        Payments
      </h3>
      <p
        v-if="!bill.payments.length"
        class="text-sm text-muted"
      >
        No payments yet.
      </p>
      <ul class="divide-y divide-default">
        <li
          v-for="payment in bill.payments"
          :key="payment.id"
          :data-testid="`payment-${payment.receiptNumber}`"
          class="flex flex-wrap items-center gap-2 py-2 text-sm"
        >
          <div class="min-w-0 flex-1">
            <p class="font-medium">
              {{ payment.receiptNumber }}
              <UBadge
                v-if="payment.reversed"
                label="Reversed"
                color="error"
                variant="subtle"
                size="sm"
                class="ms-1"
              />
            </p>
            <p class="text-muted">
              {{ formatDate(payment.paidOn) }} · {{ PAYMENT_METHOD_LABELS[payment.method] }}{{ payment.reference ? ` · ${payment.reference}` : '' }}
              <template v-if="payment.reversed && payment.reversalReason">
                · {{ payment.reversalReason }}
              </template>
            </p>
          </div>
          <span
            class="tabular-nums"
            :class="payment.reversed ? 'text-muted line-through' : 'font-medium'"
          >{{ formatNaira(payment.amountKobo) }}</span>
          <UButton
            label="Receipt"
            icon="i-lucide-printer"
            size="xs"
            color="neutral"
            variant="outline"
            :data-testid="`receipt-${payment.receiptNumber}`"
            @click="emit('receipt', payment.id)"
          />
          <UButton
            v-if="canEdit && !payment.reversed"
            label="Reverse"
            size="xs"
            color="error"
            variant="ghost"
            :data-testid="`reverse-${payment.receiptNumber}`"
            @click="emit('reverse', payment.id)"
          />
        </li>
      </ul>
    </div>
  </div>
</template>
