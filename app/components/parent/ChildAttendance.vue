<script setup lang="ts">
// A child's attendance for a term (any term of their sessions): counts, rate, and days absent or late.
const props = defineProps<{ childId: string, terms: { id: string, label: string }[], currentTermId: string | null }>()

const termId = ref(props.currentTermId ?? props.terms[0]?.id)
const { data: summary } = await useFetch(() => `/api/me/children/${props.childId}/attendance`, { query: { termId } })
const tiles = computed(() => summary.value
  ? [
      { label: 'Rate', value: summary.value.rate === null ? '—' : `${summary.value.rate}%` },
      { label: 'Days open', value: summary.value.opened },
      { label: 'Absent', value: summary.value.absent },
      { label: 'Late', value: summary.value.late },
    ]
  : [])
const lists = computed(() => summary.value
  ? [{ label: 'Days absent', dates: summary.value.absentDates }, { label: 'Days late', dates: summary.value.lateDates }].filter(l => l.dates.length)
  : [])
</script>

<template>
  <div class="space-y-4">
    <USelect
      v-model="termId"
      data-testid="child-attendance-term"
      :items="terms.map(t => ({ label: t.label, value: t.id }))"
      class="w-full sm:w-64"
    />
    <template v-if="summary">
      <div
        data-testid="child-attendance-tiles"
        class="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        <div
          v-for="tile in tiles"
          :key="tile.label"
          class="rounded-md border border-default p-3"
        >
          <p class="text-sm text-muted">
            {{ tile.label }}
          </p>
          <p class="text-xl font-semibold tabular-nums">
            {{ tile.value }}
          </p>
        </div>
      </div>
      <p
        v-if="!summary.opened"
        data-testid="child-attendance-empty"
        class="text-sm text-muted"
      >
        No registers taken in this term yet.
      </p>
      <div
        v-for="list in lists"
        :key="list.label"
      >
        <h3 class="mb-1 text-sm font-medium text-muted">
          {{ list.label }}
        </h3>
        <p class="text-sm">
          {{ list.dates.map(d => formatDate(d)).join(', ') }}
        </p>
      </div>
    </template>
  </div>
</template>
