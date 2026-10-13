<script setup lang="ts">
// The caller's own classes for the current session (admin, principal, teacher)
const { data } = await useFetch('/api/me/assignments')
// Today's register for the arms I'm class teacher of
const { data: attendance } = await useFetch('/api/attendance/arms', { key: 'attendance-arms' })
const takenToday = (armId: string) => attendance.value?.arms.find(a => a.id === armId)?.taken ?? false
// Score progress for the subjects I teach (current term)
const { data: scoreSheets } = await useFetch('/api/scores/sheets', { key: 'score-sheets' })
const progressOf = (armId: string, subjectId: string) => scoreSheets.value?.sheets.find(s => s.classArmId === armId && s.subjectId === subjectId)

const hasClasses = computed(() => !!data.value && (data.value.classTeacherOf.length > 0 || data.value.subjects.length > 0))
</script>

<template>
  <UCard data-testid="my-classes">
    <template #header>
      <h2 class="font-semibold">
        My classes{{ data?.session ? ` · ${data.session.name}` : '' }}
      </h2>
    </template>

    <p
      v-if="!data?.session"
      class="text-sm text-muted"
    >
      No current session yet.
    </p>
    <p
      v-else-if="!hasClasses"
      data-testid="my-classes-empty"
      class="text-sm text-muted"
    >
      No classes assigned to you for {{ data.session.name }}.
    </p>
    <div
      v-else
      class="space-y-4"
    >
      <div v-if="data!.classTeacherOf.length">
        <h3 class="text-sm font-medium text-muted">
          Class teacher of
        </h3>
        <ul class="mt-1 space-y-2">
          <li
            v-for="arm in data!.classTeacherOf"
            :key="arm.classArmId"
            class="flex flex-wrap items-center gap-2"
          >
            <UBadge
              :data-testid="`my-class-teacher-${arm.label}`"
              :label="arm.label"
              variant="subtle"
            />
            <span
              :data-testid="`my-register-${arm.label}`"
              class="text-sm text-muted"
            >
              Register {{ takenToday(arm.classArmId) ? 'taken today' : 'not taken today' }}
            </span>
            <UButton
              :to="`/attendance?arm=${arm.classArmId}`"
              :label="takenToday(arm.classArmId) ? 'Open register' : 'Take register'"
              size="xs"
              color="neutral"
              variant="outline"
            />
          </li>
        </ul>
      </div>
      <div v-if="data!.subjects.length">
        <h3 class="text-sm font-medium text-muted">
          Subjects I teach
        </h3>
        <ul class="mt-1 space-y-1 text-sm">
          <li
            v-for="s in data!.subjects"
            :key="`${s.subjectId}-${s.classArmId}`"
            class="flex flex-wrap items-center gap-2"
          >
            <span :data-testid="`my-subject-${s.name}-${s.label}`">{{ s.name }} — {{ s.label }}</span>
            <ULink
              v-if="progressOf(s.classArmId, s.subjectId)"
              :to="`/scores/${s.classArmId}/${s.subjectId}`"
              :data-testid="`my-scores-${s.name}-${s.label}`"
              class="text-muted"
            >
              Scores: {{ progressOf(s.classArmId, s.subjectId)!.complete }}/{{ progressOf(s.classArmId, s.subjectId)!.students }} complete
            </ULink>
          </li>
        </ul>
      </div>
    </div>
  </UCard>
</template>
