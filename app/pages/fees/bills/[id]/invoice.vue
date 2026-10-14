<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'

// A bill's printable invoice (components/fees/Invoice.vue).
definePageMeta({ roles: ['admin', 'bursar', 'principal'], layout: 'print' })

type InvoiceData = InternalApi['/api/fees/bills/:id/invoice']['get']

const route = useRoute()
const requestFetch = useRequestFetch()
const { data: invoice, error } = await useAsyncData(`invoice-${route.params.id}`, () => requestFetch<InvoiceData>(`/api/fees/bills/${route.params.id}/invoice`))
useHead({ title: () => invoice.value ? `Invoice · ${invoice.value.student.name}` : 'Invoice' })
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
      <UButton
        v-if="invoice"
        data-testid="print"
        label="Print"
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
    <FeesInvoice
      v-if="invoice"
      :invoice="invoice"
    />
  </div>
</template>
