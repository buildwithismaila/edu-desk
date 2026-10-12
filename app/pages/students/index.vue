<script setup lang="ts">
definePageMeta({ roles: ['admin', 'principal', 'bursar', 'teacher'] })
useHead({ title: 'Students' })

const { user } = useUserSession()
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">
        Students
      </h1>
      <div
        v-if="user?.role === 'admin'"
        class="flex flex-wrap gap-2"
      >
        <UButton
          to="/students/import"
          label="Import CSV"
          icon="i-lucide-file-up"
          color="neutral"
          variant="outline"
        />
        <UButton
          to="/students/new"
          data-testid="admit-student"
          label="Admit student"
          icon="i-lucide-user-plus"
        />
      </div>
    </div>

    <StudentsStudentList />
  </div>
</template>
