<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import { z } from 'zod'
import { FeesDiscountDialog, FeesPaymentDialog } from '#components'

definePageMeta({ roles: ['admin', 'bursar', 'principal'] })

type Fees = InternalApi['/api/students/:id/fees']['get']

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirmDialog()
const askReason = useNameDialog()
const overlay = useOverlay()
const paymentDialog = overlay.create(FeesPaymentDialog, { destroyOnClose: true })
const discountDialog = overlay.create(FeesDiscountDialog, { destroyOnClose: true })
const { user } = useUserSession()
const canEdit = computed(() => user.value?.role === 'admin' || user.value?.role === 'bursar')

const termId = computed({
  get: () => typeof route.query.term === 'string' ? route.query.term : undefined,
  set: value => router.replace({ query: { ...route.query, term: value } }),
})
// useRequestFetch: during SSR a bare $fetch doesn't forward the request (decision 031)
const requestFetch = useRequestFetch()
const { data: fees, refresh, error } = await useAsyncData(`student-fees-${route.params.id}`,
  () => requestFetch<Fees>(`/api/students/${route.params.id}/fees`, { query: termId.value ? { termId: termId.value } : {} }), { watch: [termId] })
useHead({ title: () => fees.value ? `Fees · ${fees.value.student.name}` : 'Fees' })

const tab = ref<'bill' | 'ledger'>('bill')
const tabs = [{ label: 'Bill', value: 'bill' }, { label: 'Ledger', value: 'ledger' }]

async function run(action: () => unknown, message: string) {
  try {
    await action()
    await refresh()
    toast.add({ title: message, color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (e) {
    toast.add({ title: apiFormErrors(e)[0]?.message ?? apiErrorMessage(e), color: 'error' })
  }
}

async function recordPayment() {
  const bill = fees.value?.bill
  if (!bill) return
  const paymentId = await paymentDialog.open({ billId: bill.id, studentName: fees.value!.student.name, balanceKobo: bill.totals.balance })
  if (!paymentId) return
  await refresh()
  toast.add({ title: 'Payment recorded', color: 'success', icon: 'i-lucide-circle-check' })
  await navigateTo(`/fees/payments/${paymentId}/receipt`, { open: { target: '_blank' } })
}

async function addDiscount() {
  if (fees.value?.bill && await discountDialog.open({ billId: fees.value.bill.id })) {
    await refresh()
    toast.add({ title: 'Discount added', color: 'success', icon: 'i-lucide-circle-check' })
  }
}

async function removeDiscount(discountId: string) {
  if (await confirm({ title: 'Remove this discount?', description: 'The bill goes back up by the discounted amount.', confirmLabel: 'Remove' })) {
    await run(() => $fetch(`/api/fees/discounts/${discountId}`, { method: 'DELETE' }), 'Discount removed')
  }
}

async function reverse(paymentId: string) {
  const reversed = await askReason({
    title: 'Reverse this payment',
    label: 'Reason (shown on the receipt)',
    placeholder: 'e.g. Recorded against the wrong student',
    schema: z.string().trim().min(3, 'Say why the payment is being reversed').max(300),
    submit: reason => $fetch(`/api/fees/payments/${paymentId}/reverse`, { method: 'POST', body: { reason } }),
  })
  if (reversed) {
    await refresh()
    toast.add({ title: 'Payment reversed', color: 'success', icon: 'i-lucide-circle-check' })
  }
}

async function toggleOptional(feeItemId: string, selected: boolean) {
  const bill = fees.value?.bill
  if (!bill) return
  const chosen = bill.optionalItems.filter(i => i.id === feeItemId ? selected : i.selected).map(i => i.id)
  await run(() => $fetch(`/api/fees/bills/${bill.id}/optional-items`, { method: 'PUT', body: { feeItemIds: chosen } }), 'Bill updated')
}

const openReceipt = (paymentId: string) => navigateTo(`/fees/payments/${paymentId}/receipt`, { open: { target: '_blank' } })
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <UButton
      :to="`/students/${route.params.id}`"
      label="Student profile"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      class="-ms-2.5"
    />
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="apiErrorMessage(error)"
    />

    <template v-if="fees">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1
            data-testid="fees-student"
            class="text-2xl font-semibold"
          >
            {{ fees.student.name }}
          </h1>
          <p class="text-sm text-muted">
            {{ fees.student.admissionNumber }}{{ fees.student.removed ? ' · removed' : '' }}
          </p>
        </div>
        <FeesTermSelect v-model="termId" />
      </div>

      <UTabs
        v-model="tab"
        :items="tabs"
        :content="false"
      />

      <UCard v-if="tab === 'bill'">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-semibold">
              {{ fees.term.label }}
            </h2>
            <div
              v-if="canEdit && fees.bill"
              class="flex flex-wrap gap-2"
            >
              <UButton
                data-testid="record-payment"
                label="Record payment"
                icon="i-lucide-banknote"
                @click="recordPayment"
              />
              <UButton
                label="Add discount"
                icon="i-lucide-percent"
                color="neutral"
                variant="outline"
                @click="addDiscount"
              />
            </div>
          </div>
        </template>
        <p
          v-if="!fees.bill"
          data-testid="fees-no-bill"
          class="text-sm text-muted"
        >
          No bill for this term yet. Generate bills on the Bills page.
        </p>
        <template v-else>
          <div
            v-if="fees.bill.optionalItems.length"
            class="mb-4 flex flex-wrap gap-4"
          >
            <UCheckbox
              v-for="item in fees.bill.optionalItems"
              :key="item.id"
              :model-value="item.selected"
              :label="`${item.name} (${formatNaira(item.amountKobo)})`"
              :disabled="!canEdit"
              @update:model-value="value => toggleOptional(item.id, !!value)"
            />
          </div>
          <FeesBillSummary
            :bill="fees.bill"
            :can-edit="canEdit"
            @receipt="openReceipt"
            @reverse="reverse"
            @remove-discount="removeDiscount"
          />
        </template>
      </UCard>

      <UCard v-else>
        <div class="overflow-x-auto">
          <table
            data-testid="ledger"
            class="w-full min-w-max text-sm"
          >
            <thead>
              <tr class="text-left text-muted">
                <th class="py-1 pe-3">
                  Date
                </th>
                <th class="py-1 pe-3">
                  Details
                </th>
                <th class="py-1 pe-3 text-right">
                  Charge
                </th>
                <th class="py-1 pe-3 text-right">
                  Payment
                </th>
                <th class="py-1 text-right">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(entry, i) in fees.ledger"
                :key="i"
                class="border-t border-default"
              >
                <td class="py-1.5 pe-3 whitespace-nowrap">
                  {{ formatDate(entry.date) }}
                </td>
                <td class="py-1.5 pe-3">
                  {{ entry.description }}
                </td>
                <td class="py-1.5 pe-3 text-right tabular-nums">
                  {{ entry.debit ? formatNaira(entry.debit) : '' }}
                </td>
                <td class="py-1.5 pe-3 text-right tabular-nums">
                  {{ entry.credit ? formatNaira(entry.credit) : '' }}
                </td>
                <td class="py-1.5 text-right font-medium tabular-nums">
                  {{ formatNaira(entry.balance) }}
                </td>
              </tr>
              <tr v-if="!fees.ledger.length">
                <td
                  colspan="5"
                  class="py-2 text-muted"
                >
                  Nothing billed yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </template>
  </div>
</template>
