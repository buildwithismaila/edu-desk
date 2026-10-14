<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'

type InvoiceData = InternalApi['/api/fees/bills/:id/invoice']['get']

// The A4 fee invoice (staff and parents): the live bill, the balance due and how to pay. Nothing is stored.
const props = defineProps<{ invoice: InvoiceData }>()
const t = computed(() => props.invoice.totals)
</script>

<template>
  <article
    data-testid="invoice"
    class="mx-auto w-full max-w-[190mm] space-y-4 bg-white p-6 text-[13px] text-black"
  >
    <header class="flex items-center gap-4 border-b-2 border-black pb-3">
      <img
        v-if="invoice.school.logoUrl"
        :src="invoice.school.logoUrl"
        alt=""
        class="size-14 object-contain"
      >
      <div class="flex-1 text-center">
        <h1 class="text-xl font-bold uppercase">
          {{ invoice.school.name }}
        </h1>
        <p v-if="invoice.school.address">
          {{ invoice.school.address }}
        </p>
        <p v-if="invoice.school.phone || invoice.school.email">
          {{ [invoice.school.phone, invoice.school.email].filter(Boolean).join(' · ') }}
        </p>
        <p class="mt-1 font-semibold uppercase">
          School fees invoice · {{ invoice.term }}
        </p>
      </div>
    </header>

    <dl class="grid grid-cols-2 gap-x-6 gap-y-2">
      <div>
        <dt class="text-xs uppercase text-gray-500">
          Student
        </dt>
        <dd
          data-testid="invoice-student"
          class="font-semibold"
        >
          {{ invoice.student.name }}
        </dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-gray-500">
          Admission no. · Class
        </dt>
        <dd>{{ invoice.student.admissionNumber }} · {{ invoice.classLabel }}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-gray-500">
          Date
        </dt>
        <dd>{{ formatDate(invoice.issuedOn) }}</dd>
      </div>
    </dl>

    <table class="w-full border-collapse">
      <thead>
        <tr class="border-b border-black text-left">
          <th class="py-1">
            Item
          </th>
          <th class="py-1 text-right">
            Amount
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(line, i) in invoice.lines"
          :key="`l${i}`"
          class="border-b border-gray-300"
        >
          <td class="py-1">
            {{ line.description }}
          </td>
          <td class="py-1 text-right tabular-nums">
            {{ line.amountKobo < 0 ? `−${formatNaira(-line.amountKobo)}` : formatNaira(line.amountKobo) }}
          </td>
        </tr>
        <tr
          v-for="(discount, i) in invoice.discounts"
          :key="`d${i}`"
          class="border-b border-gray-300"
        >
          <td class="py-1">
            Discount: {{ discount.reason }}
          </td>
          <td class="py-1 text-right tabular-nums">
            −{{ formatNaira(discount.amountKobo) }}
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td class="pt-2 text-right">
            Total
          </td>
          <td class="pt-2 text-right tabular-nums">
            {{ formatNaira(t.billed - t.discountTotal) }}
          </td>
        </tr>
        <tr>
          <td class="text-right">
            Paid so far
          </td>
          <td class="text-right tabular-nums">
            {{ formatNaira(t.paid) }}
          </td>
        </tr>
        <tr class="text-base font-bold">
          <td class="pt-1 text-right">
            {{ t.balance < 0 ? 'Credit' : 'Balance due' }}
          </td>
          <td
            data-testid="invoice-balance"
            class="pt-1 text-right tabular-nums"
          >
            {{ t.balance === 0 ? 'Fully paid' : formatNaira(Math.abs(t.balance)) }}
          </td>
        </tr>
      </tfoot>
    </table>

    <section
      v-if="invoice.school.bankAccounts.length"
      data-testid="invoice-bank"
      class="space-y-1 border-t-2 border-black pt-3"
    >
      <h2 class="font-semibold uppercase">
        How to pay
      </h2>
      <p
        v-for="account in invoice.school.bankAccounts"
        :key="account.accountNumber"
      >
        <span class="font-semibold">{{ account.bankName }}</span> · {{ account.accountName }} · <span class="font-mono font-semibold">{{ account.accountNumber }}</span>
      </p>
      <p data-testid="invoice-reference">
        Use the admission number <strong>{{ invoice.student.admissionNumber }}</strong> as the payment reference, and keep your receipt.
      </p>
    </section>
  </article>
</template>
