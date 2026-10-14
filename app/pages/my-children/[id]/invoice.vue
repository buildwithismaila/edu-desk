<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'

// A parent's printable invoice for their child (?term=<term>, default the current term).
definePageMeta({ roles: ['parent'], layout: 'print' })

type InvoiceData = InternalApi['/api/me/children/:id/invoice']['get']

const route = useRoute()
const query = computed(() => (typeof route.query.term === 'string' ? { termId: route.query.term } : {}))
const requestFetch = useRequestFetch()
const { data: invoice, error } = await useAsyncData(`my-invoice-${route.params.id}`,
  () => requestFetch<InvoiceData>(`/api/me/children/${route.params.id}/invoice`, { query: query.value }), { watch: [query] })
useHead({ title: () => invoice.value ? `Invoice · ${invoice.value.student.name}` : 'Invoice' })
const print = () => window.print()
</script>

<template>
  <div class="space-y-4 py-4">
    <div class="no-print mx-auto flex max-w-[190mm] flex-wrap items-center justify-between gap-2 px-4">
      <UButton
        :to="`/my-children/${route.params.id}?tab=fees`"
        label="Back to fees"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
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
      data-testid="invoice-unavailable"
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
