<script setup lang="ts">
import { SECTION_LABELS, SECTIONS } from '#shared/constants/academics'
import { isAssignableRole } from '#shared/utils/staff'

definePageMeta({ roles: ['admin', 'principal'] })
useHead({ title: 'Assignments' })

const { data: current } = await useCurrentTerm()
const { data: sessions } = await useFetch('/api/sessions')
const sessionId = ref(current.value?.session?.id ?? sessions.value?.[0]?.id ?? '')
const sessionItems = computed(() => (sessions.value ?? []).map(s => ({ label: s.isCurrent ? `${s.name} (current)` : s.name, value: s.id })))

const { data: assignments, refresh, error } = await useFetch('/api/assignments', {
  query: { sessionId },
  immediate: !!sessionId.value,
})
const { data: staff } = await useFetch('/api/staff', { query: { status: 'active' } })
const teachers = computed(() => (staff.value ?? []).filter(s => isAssignableRole(s.role)).map(s => ({ id: s.id, name: s.name })))

type Arm = NonNullable<typeof assignments.value>['arms'][number]
const isComplete = (arm: Arm) => !!arm.classTeacher && arm.subjects.every(s => s.teacher)

const armId = ref<string>()
const arms = computed(() => assignments.value?.arms ?? [])
watch(arms, (list) => {
  if (!list.some(a => a.classArmId === armId.value)) armId.value = list[0]?.classArmId
}, { immediate: true })
const selected = computed(() => arms.value.find(a => a.classArmId === armId.value))

const groups = computed(() => SECTIONS
  .map(section => ({ section, arms: arms.value.filter(a => a.section === section) }))
  .filter(g => g.arms.length))
const armItems = computed(() => arms.value.map(a => ({ label: isComplete(a) ? a.label : `${a.label} ⚠`, value: a.classArmId })))
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">
        Assignments
      </h1>
      <USelect
        v-if="sessionItems.length"
        v-model="sessionId"
        data-testid="assignments-session"
        :items="sessionItems"
        class="w-48"
      />
    </div>

    <UAlert
      v-if="!sessionId || error"
      color="warning"
      variant="subtle"
      title="Set a current term first"
      description="Assignments belong to a session. Create one under School setup → Calendar."
    />

    <p
      v-else-if="!arms.length"
      class="text-muted"
    >
      No class arms yet. Add them under School setup → Classes.
    </p>

    <div
      v-else
      class="grid gap-4 lg:grid-cols-[16rem_1fr]"
    >
      <!-- Mobile: pick the arm from a select -->
      <USelect
        v-model="armId"
        data-testid="arm-select"
        :items="armItems"
        class="w-full lg:hidden"
      />

      <UCard class="hidden lg:block">
        <nav class="space-y-4">
          <div
            v-for="group in groups"
            :key="group.section"
          >
            <h2 class="mb-1 text-xs font-medium uppercase text-muted">
              {{ SECTION_LABELS[group.section] }}
            </h2>
            <ul>
              <li
                v-for="arm in group.arms"
                :key="arm.classArmId"
              >
                <button
                  type="button"
                  :data-testid="`arm-${arm.label}`"
                  class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-start text-sm hover:bg-elevated"
                  :class="arm.classArmId === armId ? 'bg-elevated font-medium' : ''"
                  @click="armId = arm.classArmId"
                >
                  {{ arm.label }}
                  <UIcon
                    v-if="!isComplete(arm)"
                    name="i-lucide-triangle-alert"
                    class="size-4 text-warning"
                    aria-label="Has unassigned teachers"
                  />
                </button>
              </li>
            </ul>
          </div>
        </nav>
      </UCard>

      <UCard v-if="selected">
        <AssignmentsArmAssignmentEditor
          :key="`${sessionId}-${selected.classArmId}`"
          :arm="selected"
          :session-id="sessionId"
          :teachers="teachers"
          @saved="refresh"
        />
      </UCard>
    </div>
  </div>
</template>
