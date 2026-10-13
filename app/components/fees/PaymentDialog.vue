<script setup lang="ts">
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '#shared/schemas/fees'
import { parseNaira } from '#shared/utils/money'
import { SCHOOL_TIME_ZONE, todayIn } from '#shared/utils/dates'

// Record money received on a bill. Emits close with the new payment's id, or false when cancelled.
const props = defineProps<{ billId: string, studentName: string, balanceKobo: number }>()
const emit = defineEmits<{ close: [paymentId: string | false] }>()

const today = todayIn(SCHOOL_TIME_ZONE)
const state = reactive({
  amount: props.balanceKobo > 0 ? (props.balanceKobo / 100).toFixed(2) : '',
  method: 'cash' as typeof PAYMENT_METHODS[number],
  paidOn: today,
  reference: '',
})
const methodItems = PAYMENT_METHODS.map(m => ({ label: PAYMENT_METHOD_LABELS[m], value: m }))
const error = ref<string>()
const saving = ref(false)
const valid = computed(() => (parseNaira(state.amount) ?? 0) > 0 && !!state.paidOn)

async function save() {
  saving.value = true
  error.value = undefined
  try {
    const payment = await $fetch<{ id: string }>('/api/fees/payments', { method: 'POST', body: { billId: props.billId, ...state } })
    emit('close', payment.id)
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
    :title="`Record a payment for ${studentName}`"
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #body>
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField
          label="Amount"
          required
          :help="balanceKobo > 0 ? `Balance: ${formatNaira(balanceKobo)}` : undefined"
        >
          <FeesNairaInput
            v-model="state.amount"
            data-testid="payment-amount"
          />
        </UFormField>
        <UFormField
          label="Method"
          required
        >
          <USelect
            v-model="state.method"
            data-testid="payment-method"
            :items="methodItems"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Date paid"
          required
        >
          <UInput
            v-model="state.paidOn"
            type="date"
            :max="today"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Reference">
          <UInput
            v-model="state.reference"
            data-testid="payment-reference"
            placeholder="Teller or transfer reference"
            class="w-full"
          />
        </UFormField>
      </div>
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        :title="error"
        class="mt-3"
      />
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
          data-testid="payment-save"
          label="Record payment"
          :loading="saving"
          :disabled="!valid"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
