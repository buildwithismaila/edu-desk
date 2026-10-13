<script setup lang="ts">
import { TERM_LABELS } from '#shared/constants/academics'

definePageMeta({ roles: ['admin', 'principal', 'teacher'] })
useHead({ title: 'Results' })

const { data } = await useFetch('/api/results/arms', { key: 'result-arms' })
const { user } = useUserSession()

const STATUS = {
  draft: { label: 'Draft', color: 'neutral' },
  submitted: { label: 'Submitted', color: 'warning' },
  published: { label: 'Published', color: 'success' },
} as const
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <h1 class="text-2xl font-semibold">
      Results{{ data?.term ? ` · ${TERM_LABELS[data.term.number]} ${data.term.sessionName}` : '' }}
    </h1>

    <UAlert
      v-if="!data?.term"
      color="warning"
      variant="subtle"
      title="Set a current session and term first"
    />
    <UAlert
      v-else-if="!data.arms.length"
      data-testid="results-no-arms"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :title="user?.role === 'teacher' ? 'Results are prepared by class teachers. You\'re not a class teacher this session.' : 'No classes yet for the current session.'"
    />

    <UCard v-else>
      <ul class="divide-y divide-default">
        <li
          v-for="arm in data.arms"
          :key="arm.id"
        >
          <ULink
            :to="`/results/${arm.id}`"
            :data-testid="`results-arm-${arm.label}`"
            class="flex items-center gap-3 py-2"
          >
            <span class="flex-1 font-medium text-highlighted">{{ arm.label }}</span>
            <UBadge
              :label="STATUS[arm.status].label"
              :color="STATUS[arm.status].color"
              variant="subtle"
            />
          </ULink>
        </li>
      </ul>
    </UCard>
  </div>
</template>
