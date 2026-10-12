<script setup lang="ts">
type Person = { id: string, name: string, isActive: boolean }
type Arm = {
  classArmId: string
  label: string
  classTeacher: Person | null
  subjects: { subjectId: string, name: string, teacher: Person | null }[]
}

const props = defineProps<{
  arm: Arm
  sessionId: string
  /** Active staff who can be assigned (teachers, principals, admins) */
  teachers: { id: string, name: string }[]
}>()
const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
// USelect can't hold null, so "unassigned" is a sentinel
const NONE = 'none'

const classTeacher = ref(NONE)
const subjectTeachers = ref<Record<string, string>>({})
watch(() => props.arm, (arm) => {
  classTeacher.value = arm.classTeacher?.id ?? NONE
  subjectTeachers.value = Object.fromEntries(arm.subjects.map(s => [s.subjectId, s.teacher?.id ?? NONE]))
}, { immediate: true })

/** Active teachers, plus a deactivated teacher who is still assigned here (so the select can show them). */
const items = computed(() => {
  const assigned = [props.arm.classTeacher, ...props.arm.subjects.map(s => s.teacher)]
    .filter((p): p is Person => !!p && !p.isActive)
  const options = [
    ...props.teachers.map(t => ({ label: t.name, value: t.id })),
    ...assigned.filter((p, i, all) => all.findIndex(q => q.id === p.id) === i).map(p => ({ label: `${p.name} (deactivated)`, value: p.id })),
  ]
  return [{ label: '— Unassigned —', value: NONE }, ...options]
})

const unassignedCount = computed(() =>
  (classTeacher.value === NONE ? 1 : 0) + Object.values(subjectTeachers.value).filter(v => v === NONE).length)

const changedSubjects = computed(() => props.arm.subjects
  .filter(s => (s.teacher?.id ?? NONE) !== subjectTeachers.value[s.subjectId])
  .map(s => ({ subjectId: s.subjectId, userId: subjectTeachers.value[s.subjectId] === NONE ? null : subjectTeachers.value[s.subjectId]! })))
const classTeacherChanged = computed(() => (props.arm.classTeacher?.id ?? NONE) !== classTeacher.value)
const dirty = computed(() => classTeacherChanged.value || changedSubjects.value.length > 0)

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    if (classTeacherChanged.value) {
      await $fetch(`/api/class-arms/${props.arm.classArmId}/class-teacher`, {
        method: 'PUT',
        body: { sessionId: props.sessionId, userId: classTeacher.value === NONE ? null : classTeacher.value },
      })
    }
    if (changedSubjects.value.length) {
      await $fetch(`/api/class-arms/${props.arm.classArmId}/subject-teachers`, {
        method: 'PUT',
        body: { sessionId: props.sessionId, assignments: changedSubjects.value },
      })
    }
    toast.add({ title: `${props.arm.label} assignments saved`, color: 'success', icon: 'i-lucide-circle-check' })
    emit('saved')
  }
  catch (e) {
    toast.add({ title: apiFormErrors(e)[0]?.message ?? apiErrorMessage(e), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="text-lg font-semibold">
        {{ arm.label }}
      </h2>
      <UBadge
        v-if="unassignedCount"
        data-testid="unassigned-warning"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :label="`${unassignedCount} unassigned`"
      />
    </div>

    <UFormField
      label="Class teacher"
      :help="arm.classTeacher && !arm.classTeacher.isActive ? 'This teacher is deactivated — choose someone else' : undefined"
    >
      <USelect
        v-model="classTeacher"
        data-testid="class-teacher-select"
        :items="items"
        class="w-full sm:w-72"
      />
    </UFormField>

    <div>
      <h3 class="mb-2 text-sm font-medium">
        Subject teachers
      </h3>
      <p
        v-if="!arm.subjects.length"
        class="text-sm text-muted"
      >
        No subjects for this section yet. Add them under School setup → Subjects.
      </p>
      <ul class="divide-y divide-default">
        <li
          v-for="subject in arm.subjects"
          :key="subject.subjectId"
          :data-testid="`subject-row-${subject.name}`"
          class="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <span class="text-sm">{{ subject.name }}</span>
          <USelect
            v-model="subjectTeachers[subject.subjectId]"
            :data-testid="`subject-teacher-${subject.name}`"
            :items="items"
            :aria-label="`${subject.name} teacher`"
            class="w-full sm:w-72"
          />
        </li>
      </ul>
    </div>

    <UButton
      data-testid="assignments-save"
      label="Save assignments"
      :loading="saving"
      :disabled="!dirty"
      @click="save"
    />
  </div>
</template>
