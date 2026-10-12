<script setup lang="ts">
import { ROLE_LABELS } from '#shared/constants/roles'
import { isAssignableRole } from '#shared/utils/staff'

const { data: school } = await useSchool()
const { user } = useUserSession()
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold">
        Welcome to {{ school?.name }}
      </h1>
      <p
        v-if="user"
        data-testid="current-user"
        class="text-muted"
      >
        {{ user.name }} · {{ ROLE_LABELS[user.role] }}
      </p>
    </div>

    <DashboardMyClasses
      v-if="user && isAssignableRole(user.role)"
      class="max-w-xl"
    />
    <DashboardMyChildren
      v-if="user?.role === 'parent'"
      class="max-w-3xl"
    />
  </div>
</template>
