<script setup lang="ts">
// A child's bill for a term (read-only): lines, discounts, balance and payments, each with a receipt.
const props = defineProps<{ childId: string, terms: { id: string, label: string }[], currentTermId: string | null }>()

const termId = ref(props.currentTermId ?? props.terms[0]?.id)
// The current term stays pickable before it has a bill
const items = computed(() => {
  const options = props.terms.map(t => ({ label: t.label, value: t.id }))
  return props.currentTermId && !options.some(o => o.value === props.currentTermId)
    ? [{ label: 'This term', value: props.currentTermId }, ...options]
    : options
})
const { data: fees } = await useFetch(() => `/api/me/children/${props.childId}/fees`, { query: { termId } })
const openReceipt = (paymentId: string) => navigateTo(`/my-children/${props.childId}/receipts/${paymentId}`)
</script>

<template>
  <div class="space-y-4">
    <USelect
      v-model="termId"
      data-testid="child-fees-term"
      :items="items"
      class="w-full sm:w-64"
    />
    <p
      v-if="fees && !fees.bill"
      data-testid="child-fees-empty"
      class="text-sm text-muted"
    >
      No bill for {{ fees.term.label }} yet.
    </p>
    <FeesBillSummary
      v-if="fees?.bill"
      :bill="fees.bill"
      @receipt="openReceipt"
    />
  </div>
</template>
