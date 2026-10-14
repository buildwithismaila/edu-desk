<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import { SECTION_LABELS, SECTIONS } from '#shared/constants/academics'

// End-of-session promotion: every class, from this session into the next (docs/features/10-dashboards-promotion.md).
definePageMeta({ roles: ['admin'] })
useHead({ title: 'Promotion' })

type Promotion = InternalApi['/api/promotion']['get']

const requestFetch = useRequestFetch()
const { data: promotion } = await useAsyncData('promotion', () => requestFetch<Promotion>('/api/promotion'))
const sections = computed(() => SECTIONS
  .map(section => ({ section, label: SECTION_LABELS[section], arms: promotion.value?.arms.filter(a => a.section === section) ?? [] }))
  .filter(s => s.arms.length))
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-2xl font-semibold">
        Promotion
      </h1>
      <p
        v-if="promotion?.from"
        data-testid="promotion-sessions"
        class="text-muted"
      >
        {{ promotion.from.name }} → {{ promotion.to?.name ?? 'next session' }}
      </p>
    </div>
    <UAlert
      v-if="promotion && !promotion.from"
      color="warning"
      variant="subtle"
      title="Set the current term in Calendar first"
    />
    <UAlert
      v-else-if="promotion && !promotion.to"
      data-testid="promotion-no-session"
      color="warning"
      variant="subtle"
      title="Create the next session in Calendar first"
      description="Promotion moves each class into the session after this one."
      :actions="[{ label: 'Calendar', to: '/settings/calendar', color: 'neutral', variant: 'outline' }]"
    />

    <section
      v-for="group in sections"
      :key="group.section"
      class="space-y-2"
    >
      <h2 class="text-sm font-medium text-muted">
        {{ group.label }}
      </h2>
      <ul class="divide-y divide-default rounded-md border border-default">
        <li
          v-for="arm in group.arms"
          :key="arm.id"
        >
          <NuxtLink
            :to="`/promotion/${arm.id}`"
            :data-testid="`promotion-arm-${arm.label}`"
            class="flex items-center gap-3 p-3 hover:bg-elevated"
          >
            <span class="flex-1 font-medium">{{ arm.label }}</span>
            <span class="text-sm text-muted">{{ arm.students }} {{ arm.students === 1 ? 'student' : 'students' }}</span>
            <UBadge
              :label="arm.promotion ? 'Promoted' : 'Not promoted'"
              :color="arm.promotion ? 'success' : 'neutral'"
              variant="subtle"
            />
            <UIcon
              name="i-lucide-chevron-right"
              class="size-5 text-muted"
            />
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>
