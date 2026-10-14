<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'

// A whole class's invoices, one per printed page (?arm=<class arm>&term=<term>).
definePageMeta({ roles: ['admin', 'bursar', 'principal'], layout: 'print' })

type ClassInvoices = InternalApi['/api/fees/invoices']['get']

const route = useRoute()
const query = computed(() => ({
  classArmId: String(route.query.arm ?? ''),
  ...(typeof route.query.term === 'string' ? { termId: route.query.term } : {}),
}))
const requestFetch = useRequestFetch()
const { data, error } = await useAsyncData('class-invoices', () => requestFetch<ClassInvoices>('/api/fees/invoices', { query: query.value }), { watch: [query] })
useHead({ title: () => data.value ? `Invoices · ${data.value.arm.label}` : 'Invoices' })
const router = useRouter()
const print = () => window.print()
</script>

<template>
  <div class="space-y-4 py-4">
    <div class="no-print mx-auto flex max-w-[190mm] flex-wrap items-center justify-between gap-2 px-4">
      <UButton
        label="Back"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        @click="router.back()"
      />
      <p
        v-if="data"
        data-testid="class-invoices-count"
        class="text-sm"
      >
        {{ data.arm.label }} · {{ data.term.label }} · {{ data.invoices.length }} invoice(s)
      </p>
      <UButton
        v-if="data?.invoices.length"
        data-testid="print"
        label="Print all"
        icon="i-lucide-printer"
        @click="print"
      />
    </div>
    <p
      v-if="error"
      class="px-4 text-center"
    >
      {{ apiErrorMessage(error) }}
    </p>
    <p
      v-else-if="data && !data.invoices.length"
      class="px-4 text-center"
    >
      No bills for {{ data.arm.label }} this term yet.
    </p>
    <div
      v-for="(invoice, i) in data?.invoices"
      :key="invoice.billId"
      :style="i < data!.invoices.length - 1 ? 'break-after: page' : undefined"
    >
      <FeesInvoice :invoice="invoice" />
    </div>
  </div>
</template>
