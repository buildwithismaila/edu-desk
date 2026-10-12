<script setup lang="ts">
// The caller's own classes for the current session (admin, principal, teacher)
const { data } = await useFetch('/api/me/assignments')

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
        <div class="mt-1 flex flex-wrap gap-1">
          <UBadge
            v-for="arm in data!.classTeacherOf"
            :key="arm.classArmId"
            :data-testid="`my-class-teacher-${arm.label}`"
            :label="arm.label"
            variant="subtle"
          />
        </div>
      </div>
      <div v-if="data!.subjects.length">
        <h3 class="text-sm font-medium text-muted">
          Subjects I teach
        </h3>
        <ul class="mt-1 space-y-1 text-sm">
          <li
            v-for="s in data!.subjects"
            :key="`${s.subjectId}-${s.classArmId}`"
            :data-testid="`my-subject-${s.name}-${s.label}`"
          >
            {{ s.name }} — {{ s.label }}
          </li>
        </ul>
      </div>
    </div>
  </UCard>
</template>
