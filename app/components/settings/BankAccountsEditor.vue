<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import { type BankAccount, bankAccountSchema, MAX_BANK_ACCOUNTS } from '#shared/schemas/school'

// School profile: the accounts printed on fee invoices (at most two). Emits `saved`; the page confirms.
const props = defineProps<{ accounts: BankAccount[] }>()
const emit = defineEmits<{ saved: [] }>()

// markRaw: a reactive proxy breaks Zod (decision 020)
const schema = markRaw(z.object({ bankAccounts: z.array(bankAccountSchema).max(MAX_BANK_ACCOUNTS) }))
const state = reactive({ bankAccounts: props.accounts.map(a => ({ ...a })) })
const toast = useToast()
const saving = ref(false)

const add = () => state.bankAccounts.push({ bankName: '', accountName: '', accountNumber: '' })
const remove = (i: number) => state.bankAccounts.splice(i, 1)

async function save(event: FormSubmitEvent<z.output<typeof schema>>) {
  saving.value = true
  try {
    await $fetch('/api/school/profile', { method: 'PATCH', body: { bankAccounts: event.data.bankAccounts } })
    emit('saved')
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    data-testid="bank-accounts"
    class="space-y-4"
    @submit="save"
  >
    <p
      v-if="!state.bankAccounts.length"
      class="text-sm text-muted"
    >
      No bank accounts yet. Add the account parents pay school fees into; it's printed on invoices.
    </p>
    <div
      v-for="(account, i) in state.bankAccounts"
      :key="i"
      :data-testid="`bank-account-${i}`"
      class="grid gap-3 rounded-md border border-default p-3 sm:grid-cols-[1fr_1fr_10rem_auto] sm:items-end"
    >
      <UFormField
        label="Bank"
        :name="`bankAccounts.${i}.bankName`"
      >
        <UInput
          v-model="account.bankName"
          placeholder="e.g. Zenith Bank"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Account name"
        :name="`bankAccounts.${i}.accountName`"
      >
        <UInput
          v-model="account.accountName"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Account number"
        :name="`bankAccounts.${i}.accountNumber`"
      >
        <UInput
          v-model="account.accountNumber"
          inputmode="numeric"
          maxlength="10"
          class="w-full"
        />
      </UFormField>
      <UButton
        icon="i-lucide-trash"
        color="neutral"
        variant="ghost"
        :aria-label="`Remove account ${i + 1}`"
        @click="remove(i)"
      />
    </div>
    <div class="flex flex-wrap gap-2">
      <UButton
        v-if="state.bankAccounts.length < MAX_BANK_ACCOUNTS"
        data-testid="bank-account-add"
        label="Add account"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        @click="add"
      />
      <UButton
        data-testid="bank-accounts-save"
        type="submit"
        label="Save bank accounts"
        :loading="saving"
      />
    </div>
  </UForm>
</template>
