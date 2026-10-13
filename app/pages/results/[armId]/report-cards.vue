<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'

definePageMeta({ roles: ['admin', 'principal', 'teacher'], layout: 'print' })

type Cards = InternalApi['/api/results/report-cards']['get']

const route = useRoute()
const query = computed(() => ({
  classArmId: String(route.params.armId),
  ...(typeof route.query.term === 'string' ? { termId: route.query.term } : {}),
}))
const requestFetch = useRequestFetch()
const { data: cards, error } = await useAsyncData('report-cards', () => requestFetch<Cards>('/api/results/report-cards', { query: query.value }), { watch: [query] })
useHead({ title: () => cards.value?.[0] ? `Report cards · ${cards.value[0].arm.label}` : 'Report cards' })
const print = () => window.print()
</script>

<template>
  <div class="space-y-6 py-4">
    <div class="no-print mx-auto flex max-w-[190mm] flex-wrap items-center justify-between gap-2 px-4">
      <UButton
        :to="`/results/${route.params.armId}`"
        label="Back to results"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
      />
      <UButton
        data-testid="print"
        label="Print"
        icon="i-lucide-printer"
        @click="print"
      />
    </div>
    <p
      v-if="error"
      class="px-4 text-center text-red-700"
    >
      {{ apiErrorMessage(error) }}
    </p>
    <p
      v-else-if="cards && !cards.length"
      class="px-4 text-center"
    >
      No students in this class.
    </p>
    <ResultsReportCard
      v-for="card in cards ?? []"
      :key="card.student.id"
      :report="card"
    />
  </div>
</template>
