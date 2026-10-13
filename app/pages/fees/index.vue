<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import { SECTION_LABELS } from '#shared/constants/academics'
import { parseNaira } from '#shared/utils/money'

definePageMeta({ roles: ['admin', 'bursar', 'principal'] })
useHead({ title: 'Fee items' })

type FeeItems = InternalApi['/api/fees/items']['get']
type Row = { name: string, amount: string, optional: boolean }

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { user } = useUserSession()
const canEdit = computed(() => user.value?.role === 'admin' || user.value?.role === 'bursar')

const termId = computed({
  get: () => typeof route.query.term === 'string' ? route.query.term : undefined,
  set: value => router.replace({ query: { ...route.query, term: value } }),
})
const requestFetch = useRequestFetch()
const { data, refresh } = await useAsyncData('fee-items', () => requestFetch<FeeItems>('/api/fees/items', { query: termId.value ? { termId: termId.value } : {} }), { watch: [termId] })

// Editable copy of each level's items (amounts as naira text)
const drafts = ref<Record<string, Row[]>>({})
watch(data, (value) => {
  drafts.value = Object.fromEntries((value?.levels ?? []).map(l => [l.id, l.items.map(i => ({ name: i.name, amount: (i.amountKobo / 100).toFixed(2), optional: i.optional }))]))
}, { immediate: true })
const saved = (levelId: string) => JSON.stringify((data.value?.levels.find(l => l.id === levelId)?.items ?? []).map(i => [i.name, i.amountKobo, i.optional]))
const current = (levelId: string) => JSON.stringify((drafts.value[levelId] ?? []).map(r => [r.name.trim(), parseNaira(r.amount), r.optional]))
const levelTotal = (levelId: string) => (drafts.value[levelId] ?? []).filter(r => !r.optional).reduce((sum, r) => sum + (parseNaira(r.amount) ?? 0), 0)

const savingLevel = ref<string>()
async function save(levelId: string) {
  if (!data.value) return
  savingLevel.value = levelId
  try {
    await $fetch('/api/fees/items', { method: 'PUT', body: { termId: data.value.term.id, classLevelId: levelId, items: drafts.value[levelId] } })
    await refresh()
    toast.add({ title: 'Fee items saved', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (e) {
    toast.add({ title: apiFormErrors(e)[0]?.message ?? apiErrorMessage(e), color: 'error' })
  }
  finally {
    savingLevel.value = undefined
  }
}

// Copy a whole term's items into this term (when it has none)
const copyFrom = ref<string>()
const isEmpty = computed(() => !!data.value && data.value.levels.every(l => !l.items.length))
async function copy() {
  if (!data.value || !copyFrom.value) return
  try {
    await $fetch('/api/fees/items/copy', { method: 'POST', body: { fromTermId: copyFrom.value, toTermId: data.value.term.id } })
    await refresh()
    toast.add({ title: 'Fee items copied', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (e) {
    toast.add({ title: apiFormErrors(e)[0]?.message ?? apiErrorMessage(e), color: 'error' })
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">
        Fee items{{ data ? ` · ${data.term.label}` : '' }}
      </h1>
      <FeesTermSelect v-model="termId" />
    </div>
    <p class="text-sm text-muted">
      What each class level pays this term. Optional items (like Bus) are added per student on their fees page. After changing fees, refresh the bills.
    </p>

    <UCard v-if="canEdit && isEmpty">
      <div class="flex flex-wrap items-end gap-2">
        <UFormField
          label="Copy every class level's items from"
          class="flex-1"
        >
          <FeesTermSelect v-model="copyFrom" />
        </UFormField>
        <UButton
          label="Copy items"
          icon="i-lucide-copy"
          :disabled="!copyFrom"
          @click="copy"
        />
      </div>
    </UCard>

    <UCard
      v-for="level in data?.levels ?? []"
      :key="level.id"
      :data-testid="`fee-level-${level.name}`"
    >
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-semibold">
            {{ level.name }} <span class="text-sm font-normal text-muted">· {{ SECTION_LABELS[level.section] }}</span>
          </h2>
          <span class="text-sm text-muted tabular-nums">Compulsory: {{ formatNaira(levelTotal(level.id)) }}</span>
        </div>
      </template>
      <div class="space-y-2">
        <div
          v-for="(row, i) in drafts[level.id]"
          :key="i"
          class="grid grid-cols-[1fr_8rem_auto] items-start gap-2 sm:grid-cols-[1fr_10rem_auto_auto]"
        >
          <UInput
            v-model="row.name"
            :aria-label="`Item ${i + 1} name`"
            placeholder="e.g. Tuition"
            :disabled="!canEdit"
          />
          <FeesNairaInput
            v-model="row.amount"
            :disabled="!canEdit"
          />
          <UCheckbox
            v-model="row.optional"
            label="Optional"
            :disabled="!canEdit"
            class="col-span-2 pt-1.5 sm:col-span-1"
          />
          <UButton
            v-if="canEdit"
            icon="i-lucide-trash"
            color="neutral"
            variant="ghost"
            :aria-label="`Remove ${row.name || 'item'}`"
            class="row-start-1 sm:row-start-auto col-start-3 sm:col-start-auto"
            @click="drafts[level.id]!.splice(i, 1)"
          />
        </div>
        <p
          v-if="!drafts[level.id]?.length"
          class="text-sm text-muted"
        >
          No items yet.
        </p>
        <div
          v-if="canEdit"
          class="flex flex-wrap gap-2 pt-2"
        >
          <UButton
            label="Add item"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            size="sm"
            @click="drafts[level.id]!.push({ name: '', amount: '', optional: false })"
          />
          <UButton
            :data-testid="`fee-save-${level.name}`"
            label="Save"
            size="sm"
            :loading="savingLevel === level.id"
            :disabled="current(level.id) === saved(level.id)"
            @click="save(level.id)"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
