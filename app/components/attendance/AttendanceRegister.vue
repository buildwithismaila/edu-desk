<script setup lang="ts">
import type { AttendanceStatus } from '#shared/schemas/attendance'

type RegisterStudent = { id: string, name: string, admissionNumber: string, photoUrl: string | null, status: AttendanceStatus | null }

// One-tap register: everyone starts present (unmarked students too), the teacher taps the exceptions.
const props = defineProps<{ students: RegisterStudent[], readonly?: boolean, saving?: boolean }>()
const emit = defineEmits<{ save: [marks: { studentId: string, status: AttendanceStatus }[]] }>()

const statuses = ref<Record<string, AttendanceStatus>>({})
watch(() => props.students, (students) => {
  statuses.value = Object.fromEntries(students.map(s => [s.id, s.status ?? 'present']))
}, { immediate: true })

const OPTIONS = [
  { value: 'present', short: 'P', label: 'Present', color: 'success' },
  { value: 'absent', short: 'A', label: 'Absent', color: 'error' },
  { value: 'late', short: 'L', label: 'Late', color: 'warning' },
] as const

const counts = computed(() => {
  const values = Object.values(statuses.value)
  return { present: values.filter(s => s === 'present').length, absent: values.filter(s => s === 'absent').length, late: values.filter(s => s === 'late').length }
})

function markAllPresent() {
  statuses.value = Object.fromEntries(props.students.map(s => [s.id, 'present' as const]))
}

function save() {
  emit('save', props.students.map(s => ({ studentId: s.id, status: statuses.value[s.id]! })))
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p
        data-testid="register-counts"
        class="text-sm"
      >
        <span class="font-medium text-success">Present {{ counts.present }}</span>
        · <span class="font-medium text-error">Absent {{ counts.absent }}</span>
        · <span class="font-medium text-warning">Late {{ counts.late }}</span>
      </p>
      <UButton
        v-if="!readonly"
        data-testid="register-all-present"
        label="Mark all present"
        icon="i-lucide-check-check"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="markAllPresent"
      />
    </div>

    <ul class="divide-y divide-default rounded-md border border-default">
      <li
        v-for="student in students"
        :key="student.id"
        :data-testid="`register-row-${student.admissionNumber}`"
        class="flex items-center gap-3 px-3 py-2"
      >
        <UAvatar
          :src="student.photoUrl ?? undefined"
          :alt="student.name"
          size="md"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">
            {{ student.name }}
          </p>
          <p class="truncate text-xs text-muted">
            {{ student.admissionNumber }}
          </p>
        </div>
        <UFieldGroup>
          <UButton
            v-for="option in OPTIONS"
            :key="option.value"
            :data-testid="`mark-${option.value}`"
            :label="option.short"
            :aria-label="`${option.label}: ${student.name}`"
            :aria-pressed="statuses[student.id] === option.value"
            :color="statuses[student.id] === option.value ? option.color : 'neutral'"
            :variant="statuses[student.id] === option.value ? 'solid' : 'outline'"
            :disabled="readonly"
            class="w-10 justify-center"
            @click="statuses[student.id] = option.value"
          />
        </UFieldGroup>
      </li>
    </ul>

    <div
      v-if="!readonly"
      class="sticky bottom-0 -mx-4 border-t border-default bg-default/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0"
    >
      <UButton
        data-testid="register-save"
        label="Save register"
        icon="i-lucide-save"
        size="lg"
        block
        class="sm:w-auto"
        :loading="saving"
        :disabled="!students.length"
        @click="save"
      />
    </div>
  </div>
</template>
