<script setup lang="ts">
import { ROLE_LABELS } from '#shared/constants/roles'

const { data: school } = await useSchool()
const { user } = useUserSession()
</script>

<template>
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
</template>
