<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import { PAYMENT_METHOD_LABELS } from '#shared/schemas/fees'

type StaffReceipt = InternalApi['/api/fees/payments/:id']['get']
type ParentReceipt = InternalApi['/api/me/children/:id/payments/:paymentId']['get']

// The printable A4 receipt (staff and parents); a reversed payment is stamped REVERSED (with the reason for staff).
const props = defineProps<{ receipt: StaffReceipt | ParentReceipt }>()
// Parents don't get the reason
const reversalReason = computed(() => props.receipt.reversal && 'reason' in props.receipt.reversal ? props.receipt.reversal.reason : null)
</script>

<template>
  <article
    data-testid="receipt"
    class="relative mx-auto w-full max-w-[190mm] space-y-4 bg-white p-6 text-[13px] text-black"
  >
    <header class="flex items-center gap-4 border-b-2 border-black pb-3">
      <img
        v-if="receipt.school.logoUrl"
        :src="receipt.school.logoUrl"
        alt=""
        class="size-14 object-contain"
      >
      <div class="flex-1 text-center">
        <h1 class="text-xl font-bold uppercase">
          {{ receipt.school.name }}
        </h1>
        <p v-if="receipt.school.address">
          {{ receipt.school.address }}
        </p>
        <p v-if="receipt.school.phone || receipt.school.email">
          {{ [receipt.school.phone, receipt.school.email].filter(Boolean).join(' · ') }}
        </p>
        <p class="mt-1 font-semibold uppercase">
          Official receipt
        </p>
      </div>
    </header>

    <div
      v-if="receipt.reversal"
      data-testid="receipt-reversed"
      class="rotate-[-4deg] border-4 border-red-700 px-4 py-2 text-center text-xl font-bold uppercase tracking-widest text-red-700"
    >
      Reversed
      <span class="block text-sm font-normal normal-case tracking-normal">{{ [reversalReason, formatDateTime(receipt.reversal.at)].filter(Boolean).join(' · ') }}</span>
    </div>

    <dl class="grid grid-cols-2 gap-x-6 gap-y-2">
      <div>
        <dt class="text-xs uppercase text-gray-500">
          Receipt no.
        </dt>
        <dd
          data-testid="receipt-number"
          class="font-semibold"
        >
          {{ receipt.receiptNumber }}
        </dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-gray-500">
          Date
        </dt>
        <dd>{{ formatDate(receipt.paidOn) }}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-gray-500">
          Received from (student)
        </dt>
        <dd class="font-semibold">
          {{ receipt.student.name }}
        </dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-gray-500">
          Admission no. · Class
        </dt>
        <dd>{{ receipt.student.admissionNumber }} · {{ receipt.classLabel }}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-gray-500">
          For
        </dt>
        <dd>School fees, {{ receipt.term }}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-gray-500">
          Method
        </dt>
        <dd>{{ PAYMENT_METHOD_LABELS[receipt.method] }}{{ receipt.reference ? ` · ${receipt.reference}` : '' }}</dd>
      </div>
    </dl>

    <div class="flex items-center justify-between border-y-2 border-black py-3">
      <span class="text-sm uppercase">Amount received</span>
      <span
        data-testid="receipt-amount"
        class="text-2xl font-bold tabular-nums"
      >{{ formatNaira(receipt.amountKobo) }}</span>
    </div>

    <p data-testid="receipt-balance">
      <span class="text-gray-500">{{ receipt.balanceKobo < 0 ? 'Credit on account:' : 'Balance outstanding:' }}</span>
      <strong class="tabular-nums">{{ receipt.balanceKobo === 0 ? 'Fully paid' : formatNaira(Math.abs(receipt.balanceKobo)) }}</strong>
    </p>

    <footer class="flex justify-between pt-8 text-sm">
      <span>Received by: {{ receipt.receivedBy ?? '—' }}</span>
      <span class="border-t border-black px-8 pt-1">Signature &amp; stamp</span>
    </footer>
  </article>
</template>
