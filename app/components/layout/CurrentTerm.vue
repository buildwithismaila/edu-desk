<script setup lang="ts">
import { TERM_LABELS } from '#shared/constants/academics'

const { data } = await useCurrentTerm()
const { user } = useUserSession()

const label = computed(() => data.value?.session && data.value.term
  ? `${data.value.session.name} · ${TERM_LABELS[data.value.term.number]}`
  : null)
</script>

<template>
  <div
    data-testid="current-term"
    class="text-sm"
  >
    <UBadge
      v-if="label"
      color="neutral"
      variant="subtle"
      icon="i-lucide-calendar"
      :label="label"
    />
    <ULink
      v-else-if="user?.role === 'admin'"
      to="/settings/calendar"
      class="text-warning"
    >
      No current term — set one
    </ULink>
    <span
      v-else
      class="text-muted"
    >No current term</span>
  </div>
</template>
