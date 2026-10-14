<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import type { PromotionRow } from '#shared/utils/promotion'

// One class's end-of-session promotion (components/promotion/PromotionArm.vue).
definePageMeta({ roles: ['admin'] })

type ArmPromotion = InternalApi['/api/promotion/:armId']['get']

const route = useRoute()
const toast = useToast()
const confirm = useConfirmDialog()
const armId = String(route.params.armId)
const requestFetch = useRequestFetch()
const { data, error } = await useAsyncData(`promotion-${armId}`, () => requestFetch<ArmPromotion>(`/api/promotion/${armId}`))
useHead({ title: () => data.value ? `Promotion · ${data.value.arm.label}` : 'Promotion' })

const busy = ref(false)
async function promote(rows: PromotionRow[]) {
  if (!data.value?.to) return
  if (!await confirm({
    title: `Promote ${data.value.arm.label} into ${data.value.to.name}?`,
    description: 'Each student is placed in their class for next session. You can undo this until the new session starts.',
    confirmLabel: 'Promote',
  })) return
  busy.value = true
  try {
    data.value = await $fetch<ArmPromotion>(`/api/promotion/${armId}`, { method: 'POST', body: { toSessionId: data.value.to.id, students: rows } })
    toast.add({ title: `${data.value.arm.label} promoted`, color: 'success' })
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

async function undo() {
  if (!data.value) return
  if (!await confirm({ title: `Undo ${data.value.arm.label}'s promotion?`, description: 'Their classes for next session are removed, so you can promote again.', confirmLabel: 'Undo' })) return
  try {
    data.value = await $fetch<ArmPromotion>(`/api/promotion/${armId}`, { method: 'DELETE' })
    toast.add({ title: 'Promotion undone', color: 'success' })
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-4">
    <UButton
      to="/promotion"
      label="Promotion"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      class="-ms-2"
    />
    <p v-if="error">
      {{ error.statusCode === 404 ? 'Class not found.' : apiErrorMessage(error) }}
    </p>
    <template v-if="data">
      <div>
        <h1
          data-testid="promotion-arm-title"
          class="text-2xl font-semibold"
        >
          {{ data.arm.label }}
        </h1>
        <p class="text-muted">
          {{ data.from.name }} → {{ data.to?.name ?? 'next session' }}
        </p>
      </div>
      <PromotionArm
        :data="data"
        :class="{ 'pointer-events-none opacity-60': busy }"
        @promote="promote"
        @undo="undo"
      />
    </template>
  </div>
</template>
