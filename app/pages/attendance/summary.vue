<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { InternalApi } from 'nitropack/types'
import { TERM_LABELS } from '#shared/constants/academics'

definePageMeta({ roles: ['admin', 'principal', 'teacher'] })
useHead({ title: 'Attendance summary' })

type Summary = InternalApi['/api/attendance/summary']['get']
type Row = Summary['students'][number]

const route = useRoute()
const router = useRouter()
const { user } = useUserSession()

const { data: armList } = await useFetch('/api/attendance/arms', { key: 'attendance-arms' })
const arms = computed(() => armList.value?.arms ?? [])
const armId = computed(() => typeof route.query.arm === 'string' ? route.query.arm : arms.value.length === 1 ? arms.value[0]!.id : undefined)
const selectedArm = computed({
  get: () => armId.value,
  set: value => router.replace({ query: { ...route.query, arm: value } }),
})
const armItems = computed(() => arms.value.map(a => ({ label: a.label, value: a.id })))

// useRequestFetch: during SSR a bare $fetch doesn't forward the request (host, cookie), so the tenant is unknown
const requestFetch = useRequestFetch()
// Explicit type: inference on this path overflows TS (TS2321, see PROGRESS.md)
const { data: summary, error } = await useAsyncData('attendance-summary',
  () => armId.value ? requestFetch<Summary>('/api/attendance/summary', { query: { classArmId: armId.value } }) : Promise.resolve(null),
  { watch: [armId] })

// Lowest attendance first helps spot students to follow up
const lowestFirst = ref(false)
const rows = computed(() => {
  const list = [...(summary.value?.students ?? [])]
  return lowestFirst.value ? list.sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101)) : list
})
const columns: TableColumn<Row>[] = [
  { accessorKey: 'name', header: 'Student' },
  { accessorKey: 'opened', header: 'Days', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { accessorKey: 'present', header: 'Present', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { accessorKey: 'absent', header: 'Absent', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { accessorKey: 'late', header: 'Late', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { accessorKey: 'rate', header: '%', meta: { class: { th: 'text-right', td: 'text-right' } } },
]
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <UButton
      :to="armId ? `/attendance?arm=${armId}` : '/attendance'"
      label="Register"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      class="-ms-2.5"
    />
    <h1 class="text-2xl font-semibold">
      Attendance summary
    </h1>

    <UAlert
      v-if="!arms.length"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :title="user?.role === 'teacher' ? 'Attendance is taken by class teachers. You\'re not a class teacher this session.' : 'No classes yet for the current session.'"
    />

    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <USelect
          v-if="arms.length > 1"
          v-model="selectedArm"
          data-testid="summary-arm"
          :items="armItems"
          placeholder="Choose a class"
          class="w-full sm:w-60"
        />
        <USwitch
          v-model="lowestFirst"
          label="Lowest attendance first"
        />
      </div>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        :title="apiErrorMessage(error)"
      />

      <template v-if="summary">
        <p
          data-testid="summary-heading"
          class="text-sm text-muted"
        >
          {{ summary.arm.label }} · {{ summary.term.sessionName }} {{ TERM_LABELS[summary.term.number] }} · {{ summary.registers }} {{ summary.registers === 1 ? 'register' : 'registers' }} taken
        </p>
        <UTable
          data-testid="summary-table"
          :data="rows"
          :columns="columns"
          empty="No students in this class."
        >
          <template #name-cell="{ row }">
            <ULink
              :to="`/students/${row.original.id}`"
              class="font-medium text-highlighted"
            >
              {{ row.original.name }}
            </ULink>
          </template>
          <template #rate-cell="{ row }">
            <span :class="row.original.rate !== null && row.original.rate < 75 ? 'font-medium text-error' : ''">
              {{ row.original.rate === null ? '—' : `${row.original.rate}%` }}
            </span>
          </template>
        </UTable>
      </template>
    </template>
  </div>
</template>
