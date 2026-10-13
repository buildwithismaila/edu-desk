<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import { TERM_LABELS } from '#shared/constants/academics'

definePageMeta({ roles: ['admin', 'principal', 'teacher'], layout: 'print' })

type Broadsheet = InternalApi['/api/results/broadsheet']['get']

const route = useRoute()
const query = computed(() => ({
  classArmId: String(route.params.armId),
  ...(typeof route.query.term === 'string' ? { termId: route.query.term } : {}),
}))
const requestFetch = useRequestFetch()
const { data: sheet, error } = await useAsyncData('broadsheet', () => requestFetch<Broadsheet>('/api/results/broadsheet', { query: query.value }), { watch: [query] })
useHead({ title: () => sheet.value ? `Broadsheet · ${sheet.value.arm.label}` : 'Broadsheet' })

const stat = (subjectId: string, key: 'average' | 'highest' | 'lowest') => sheet.value?.subjectStats.find(s => s.subjectId === subjectId)?.[key] ?? '—'
const print = () => window.print()
</script>

<template>
  <div class="space-y-4 p-4 text-black">
    <div class="no-print flex flex-wrap items-center justify-between gap-2">
      <UButton
        :to="`/results/${route.params.armId}`"
        label="Back to results"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
      />
      <UButton
        label="Print"
        icon="i-lucide-printer"
        @click="print"
      />
    </div>
    <p
      v-if="error"
      class="text-center text-red-700"
    >
      {{ apiErrorMessage(error) }}
    </p>

    <template v-if="sheet">
      <h1 class="text-lg font-bold">
        Broadsheet · {{ sheet.arm.label }} · {{ TERM_LABELS[sheet.term.number] }} {{ sheet.term.sessionName }}
        <span
          v-if="sheet.status !== 'published'"
          class="text-sm font-normal"
        >(draft)</span>
      </h1>
      <div class="overflow-x-auto">
        <table
          data-testid="broadsheet"
          class="w-full border-collapse text-xs"
        >
          <thead>
            <tr class="bg-gray-100">
              <th
                v-if="sheet.showPositions"
                class="border border-gray-400 px-1 py-1"
              >
                Pos.
              </th>
              <th class="border border-gray-400 px-1 py-1 text-left">
                Student
              </th>
              <th
                v-for="subject in sheet.subjects"
                :key="subject.id"
                class="border border-gray-400 px-1 py-1"
              >
                {{ subject.name }}
              </th>
              <th class="border border-gray-400 px-1 py-1">
                Total
              </th>
              <th class="border border-gray-400 px-1 py-1">
                Average
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="student in sheet.students"
              :key="student.id"
            >
              <td
                v-if="sheet.showPositions"
                class="border border-gray-400 px-1 py-0.5 text-center"
              >
                {{ student.position ?? '—' }}
              </td>
              <td class="border border-gray-400 px-1 py-0.5 whitespace-nowrap">
                {{ student.name }}
              </td>
              <td
                v-for="subject in sheet.subjects"
                :key="subject.id"
                class="border border-gray-400 px-1 py-0.5 text-center"
              >
                {{ student.totals[subject.id] ?? '—' }}
              </td>
              <td class="border border-gray-400 px-1 py-0.5 text-center font-semibold">
                {{ student.total ?? '—' }}
              </td>
              <td class="border border-gray-400 px-1 py-0.5 text-center font-semibold">
                {{ student.average?.toFixed(2) ?? '—' }}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr
              v-for="row in [{ key: 'average', label: 'Class average' }, { key: 'highest', label: 'Highest' }, { key: 'lowest', label: 'Lowest' }] as const"
              :key="row.key"
              class="bg-gray-50"
            >
              <td
                :colspan="sheet.showPositions ? 2 : 1"
                class="border border-gray-400 px-1 py-0.5 font-semibold"
              >
                {{ row.label }}
              </td>
              <td
                v-for="subject in sheet.subjects"
                :key="subject.id"
                class="border border-gray-400 px-1 py-0.5 text-center"
              >
                {{ stat(subject.id, row.key) }}
              </td>
              <td
                colspan="2"
                class="border border-gray-400"
              />
            </tr>
          </tfoot>
        </table>
      </div>
    </template>
  </div>
</template>

<style>
@media print {
  @page {
    size: A4 landscape;
  }
}
</style>
