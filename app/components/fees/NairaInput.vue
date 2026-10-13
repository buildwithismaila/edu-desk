<script setup lang="ts">
import { parseNaira } from '#shared/utils/money'

// A naira amount as typed ("25,000.50"). The text is the model; the API converts it to kobo.
// Shows a message when it isn't a valid amount.
const amount = defineModel<string>({ required: true })
defineProps<{ placeholder?: string, disabled?: boolean }>()

const error = computed(() => amount.value.trim() && parseNaira(amount.value) === null ? 'Enter an amount like 25,000 or 25,000.50' : undefined)
defineExpose({ error })
</script>

<template>
  <div>
    <UInput
      v-model="amount"
      inputmode="decimal"
      autocomplete="off"
      :placeholder="placeholder ?? '0.00'"
      :disabled="disabled"
      :color="error ? 'error' : 'primary'"
      :highlight="!!error"
      :ui="{ base: 'text-right tabular-nums' }"
      class="w-full"
    >
      <template #leading>
        <span class="text-muted">₦</span>
      </template>
    </UInput>
    <p
      v-if="error"
      data-testid="naira-error"
      class="mt-1 text-xs text-error"
    >
      {{ error }}
    </p>
  </div>
</template>
