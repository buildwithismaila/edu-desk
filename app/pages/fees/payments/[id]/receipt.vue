<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'

// A printable A4 receipt for one payment (components/fees/Receipt.vue).
definePageMeta({ roles: ['admin', 'bursar', 'principal'], layout: 'print' })

type Payment = InternalApi['/api/fees/payments/:id']['get']

const route = useRoute()
const requestFetch = useRequestFetch()
const { data: receipt, error } = await useAsyncData(`receipt-${route.params.id}`, () => requestFetch<Payment>(`/api/fees/payments/${route.params.id}`))
useHead({ title: () => receipt.value ? `Receipt ${receipt.value.receiptNumber}` : 'Receipt' })
const print = () => window.print()
</script>

<template>
  <div class="space-y-4 py-4">
    <div class="no-print mx-auto flex max-w-[190mm] flex-wrap items-center justify-between gap-2 px-4">
      <UButton
        :to="receipt ? `/students/${receipt.student.id}/fees` : '/fees/bills'"
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
      class="px-4 text-center"
    >
      {{ apiErrorMessage(error) }}
    </p>

    <FeesReceipt
      v-if="receipt"
      :receipt="receipt"
    />
  </div>
</template>
