<script setup lang="ts">
import { TERM_LABELS } from '#shared/constants/academics'

definePageMeta({ roles: ['admin', 'principal', 'teacher'] })
useHead({ title: 'Scores' })

const toast = useToast()
const { user } = useUserSession()
const canLock = computed(() => user.value?.role === 'admin' || user.value?.role === 'principal')

const { data, refresh } = await useFetch('/api/scores/sheets', { key: 'score-sheets' })
type Sheet = NonNullable<typeof data.value>['sheets'][number]

// Admin and principal see every class: pick one at a time
const ALL = 'all'
const armFilter = ref(ALL)
const armItems = computed(() => [{ label: 'All classes', value: ALL }, ...uniqueArms.value.map(a => ({ label: a.label, value: a.id }))])
const uniqueArms = computed(() => {
  const arms = new Map<string, { id: string, label: string, locked: boolean, sheets: Sheet[] }>()
  for (const sheet of data.value?.sheets ?? []) {
    const arm = arms.get(sheet.classArmId) ?? { id: sheet.classArmId, label: sheet.armLabel, locked: sheet.locked, sheets: [] }
    arm.sheets.push(sheet)
    arms.set(sheet.classArmId, arm)
  }
  return [...arms.values()]
})
const shownArms = computed(() => armFilter.value === ALL ? uniqueArms.value : uniqueArms.value.filter(a => a.id === armFilter.value))

async function setLock(arm: { id: string, label: string }, locked: boolean) {
  if (!data.value?.term) return
  try {
    await $fetch('/api/scores/locks', { method: locked ? 'PUT' : 'DELETE', body: { termId: data.value.term.id, classArmId: arm.id } })
    await refresh()
    toast.add({ title: `${arm.label} ${locked ? 'locked' : 'unlocked'}`, color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-4xl space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">
        Scores{{ data?.term ? ` · ${TERM_LABELS[data.term.number]}` : '' }}
      </h1>
      <UButton
        to="/scores/ratings"
        label="Ratings & comments"
        icon="i-lucide-star"
        color="neutral"
        variant="outline"
        size="sm"
      />
    </div>

    <UAlert
      v-if="!data?.term"
      color="warning"
      variant="subtle"
      title="Set a current session and term first"
    />
    <UAlert
      v-else-if="!data.sheets.length"
      data-testid="scores-no-sheets"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="No score sheets for you this term."
      description="Subject teachers see the subjects they're assigned to on the Assignments page."
    />

    <template v-else>
      <USelect
        v-if="uniqueArms.length > 1"
        v-model="armFilter"
        data-testid="scores-arm-filter"
        :items="armItems"
        class="w-full sm:w-60"
      />

      <UCard
        v-for="arm in shownArms"
        :key="arm.id"
        :data-testid="`scores-arm-${arm.label}`"
      >
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-semibold">
              {{ arm.label }}
              <UBadge
                v-if="arm.locked"
                label="Locked"
                color="warning"
                variant="subtle"
                icon="i-lucide-lock"
                class="ms-1"
              />
            </h2>
            <UButton
              v-if="canLock"
              :data-testid="`scores-lock-${arm.label}`"
              :label="arm.locked ? 'Unlock' : 'Lock'"
              :icon="arm.locked ? 'i-lucide-lock-open' : 'i-lucide-lock'"
              color="neutral"
              variant="outline"
              size="xs"
              @click="setLock(arm, !arm.locked)"
            />
          </div>
        </template>
        <ul class="divide-y divide-default">
          <li
            v-for="sheet in arm.sheets"
            :key="sheet.subjectId"
          >
            <ULink
              :to="`/scores/${sheet.classArmId}/${sheet.subjectId}`"
              :data-testid="`scores-sheet-${arm.label}-${sheet.subjectName}`"
              class="flex flex-wrap items-center gap-3 py-2"
            >
              <span class="min-w-0 flex-1 font-medium text-highlighted">{{ sheet.subjectName }}</span>
              <span class="text-sm text-muted">{{ sheet.complete }}/{{ sheet.students }} complete</span>
              <UProgress
                :model-value="sheet.students ? (sheet.complete / sheet.students) * 100 : 0"
                class="w-24"
                size="sm"
              />
            </ULink>
          </li>
        </ul>
      </UCard>
    </template>
  </div>
</template>
