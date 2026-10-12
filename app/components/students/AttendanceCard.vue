<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import { TERM_LABELS } from '#shared/constants/academics'

// "Attendance this term" on the student profile (not shown to the bursar: nothing academic)
const props = defineProps<{ studentId: string }>()

// Explicit type: `/api/students/${id}/...` also matches static routes, so inference fails
const { data } = await useFetch<InternalApi['/api/students/:id/attendance']['get']>(() => `/api/students/${props.studentId}/attendance`)
</script>

<template>
  <UCard data-testid="student-attendance">
    <template #header>
      <h2 class="font-semibold">
        Attendance{{ data ? ` · ${data.term.sessionName} ${TERM_LABELS[data.term.number]}` : '' }}
      </h2>
    </template>
    <p
      v-if="!data || data.opened === 0"
      class="text-sm text-muted"
    >
      No registers taken for this student this term yet.
    </p>
    <div
      v-else
      class="space-y-3"
    >
      <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt class="text-sm text-muted">
            Present
          </dt>
          <dd
            data-testid="student-attendance-present"
            class="text-lg font-semibold"
          >
            {{ data.present }} / {{ data.opened }}
          </dd>
        </div>
        <div>
          <dt class="text-sm text-muted">
            Attendance
          </dt>
          <dd class="text-lg font-semibold">
            {{ data.rate }}%
          </dd>
        </div>
        <div>
          <dt class="text-sm text-muted">
            Absent
          </dt>
          <dd class="text-lg font-semibold">
            {{ data.absent }}
          </dd>
        </div>
        <div>
          <dt class="text-sm text-muted">
            Late
          </dt>
          <dd class="text-lg font-semibold">
            {{ data.late }}
          </dd>
        </div>
      </dl>
      <p
        v-if="data.absentDates.length"
        class="text-sm"
      >
        <span class="text-muted">Absent on</span> {{ data.absentDates.map(formatDate).join(', ') }}
      </p>
      <p
        v-if="data.lateDates.length"
        class="text-sm"
      >
        <span class="text-muted">Late on</span> {{ data.lateDates.map(formatDate).join(', ') }}
      </p>
    </div>
  </UCard>
</template>
