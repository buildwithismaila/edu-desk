<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'

// One student's report card. Parents see it once published (the API returns 404 before that).
definePageMeta({ roles: ['admin', 'principal', 'teacher', 'parent'], layout: 'print' })

type Report = InternalApi['/api/students/:id/report-card']['get']

const route = useRoute()
const query = computed(() => (typeof route.query.term === 'string' ? { termId: route.query.term } : {}))
const requestFetch = useRequestFetch()
const { data: report, error } = await useAsyncData(`report-card-${route.params.id}`,
  () => requestFetch<Report>(`/api/students/${route.params.id}/report-card`, { query: query.value }), { watch: [query] })
useHead({ title: () => report.value ? `Report card · ${report.value.student.name}` : 'Report card' })
const { user } = useUserSession()
const print = () => window.print()
</script>

<template>
  <div class="space-y-4 py-4">
    <div class="no-print mx-auto flex max-w-[190mm] flex-wrap items-center justify-between gap-2 px-4">
      <UButton
        :to="user?.role === 'parent' ? '/' : `/students/${route.params.id}`"
        :label="user?.role === 'parent' ? 'My children' : 'Student profile'"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
      />
      <UButton
        v-if="report"
        label="Print"
        icon="i-lucide-printer"
        @click="print"
      />
    </div>
    <p
      v-if="error"
      data-testid="report-card-unavailable"
      class="px-4 text-center"
    >
      {{ error.statusCode === 404 ? 'This report card isn\'t available yet.' : apiErrorMessage(error) }}
    </p>
    <ResultsReportCard
      v-if="report"
      :report="report"
    />
  </div>
</template>
