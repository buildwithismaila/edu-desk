<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'

// A parent's printable receipt for a payment on their child's bill (components/fees/Receipt.vue).
definePageMeta({ roles: ['parent'], layout: 'print' })

type Receipt = InternalApi['/api/me/children/:id/payments/:paymentId']['get']

const route = useRoute()
const requestFetch = useRequestFetch()
const { data: receipt, error } = await useAsyncData(`my-receipt-${route.params.paymentId}`,
  () => requestFetch<Receipt>(`/api/me/children/${route.params.id}/payments/${route.params.paymentId}`))
useHead({ title: () => receipt.value ? `Receipt ${receipt.value.receiptNumber}` : 'Receipt' })
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
        v-if="receipt"
        data-testid="print"
        label="Print"
        icon="i-lucide-printer"
        @click="print"
      />
    </div>
    <p
      v-if="error"
      data-testid="receipt-not-found"
      class="px-4 text-center"
    >
      {{ error.statusCode === 404 ? 'Receipt not found.' : apiErrorMessage(error) }}
    </p>
    <FeesReceipt
      v-if="receipt"
      :receipt="receipt"
    />
  </div>
</template>
