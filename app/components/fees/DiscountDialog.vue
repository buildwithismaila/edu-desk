<script setup lang="ts">
// Add a fixed (₦) or percent discount to a bill, with a reason. Emits close(true) when added.
const props = defineProps<{ billId: string }>()
const emit = defineEmits<{ close: [added: boolean] }>()

const state = reactive({ kind: 'percent' as 'percent' | 'fixed', amount: '', percent: undefined as number | undefined, reason: '' })
const kindItems = [{ label: 'Percentage of the fees', value: 'percent' }, { label: 'Fixed amount', value: 'fixed' }]
const error = ref<string>()
const saving = ref(false)

async function save() {
  saving.value = true
  error.value = undefined
  try {
    const body = state.kind === 'percent'
      ? { kind: 'percent', percent: state.percent, reason: state.reason }
      : { kind: 'fixed', amount: state.amount, reason: state.reason }
    await $fetch(`/api/fees/bills/${props.billId}/discounts`, { method: 'POST', body })
    emit('close', true)
  }
  catch (e) {
    error.value = apiFormErrors(e)[0]?.message ?? apiErrorMessage(e)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    title="Add a discount"
    description="Applies to this term's fees (not arrears), and never more than the fees."
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #body>
      <div class="space-y-3">
        <UFormField label="Type">
          <USelect
            v-model="state.kind"
            :items="kindItems"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="state.kind === 'percent'"
          label="Percentage"
        >
          <UInputNumber
            v-model="state.percent"
            data-testid="discount-percent"
            :min="0.01"
            :max="100"
            :step="0.5"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-else
          label="Amount"
        >
          <FeesNairaInput v-model="state.amount" />
        </UFormField>
        <UFormField
          label="Reason"
          required
        >
          <UInput
            v-model="state.reason"
            data-testid="discount-reason"
            placeholder="e.g. Sibling discount, scholarship"
            class="w-full"
          />
        </UFormField>
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :title="error"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="emit('close', false)"
        />
        <UButton
          data-testid="discount-save"
          label="Add discount"
          :loading="saving"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
