<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'

type Child = InternalApi['/api/me/children']['get'][number]

// One child on a parent's dashboard: class, this term's attendance and fees, and the latest report card.
const props = defineProps<{ child: Child }>()

const fees = computed(() => {
  const balance = props.child.balanceKobo
  if (balance === null) return null
  if (balance > 0) return { label: `Owing ${formatNaira(balance)}`, class: 'text-error' }
  if (balance < 0) return { label: `Credit ${formatNaira(-balance)}`, class: 'text-success' }
  return { label: 'Fully paid', class: 'text-success' }
})
const absent = computed(() => `absent ${props.child.absentDays} ${props.child.absentDays === 1 ? 'day' : 'days'}`)
</script>

<template>
  <UCard :data-testid="`my-child-${child.admissionNumber}`">
    <NuxtLink
      :to="`/my-children/${child.id}`"
      :data-testid="`my-child-open-${child.admissionNumber}`"
      class="flex items-center gap-3"
    >
      <UAvatar
        :src="child.photoUrl ?? undefined"
        :alt="child.name"
        size="xl"
      />
      <div class="min-w-0 flex-1">
        <p class="font-medium">
          {{ child.name }}
        </p>
        <p class="text-sm text-muted">
          {{ child.classLabel ?? 'No class this session' }}
        </p>
        <p class="text-sm text-muted">
          {{ child.admissionNumber }}
        </p>
      </div>
      <UIcon
        name="i-lucide-chevron-right"
        class="size-5 shrink-0 text-muted"
      />
    </NuxtLink>
    <dl class="mt-3 grid grid-cols-2 gap-2 border-t border-default pt-3 text-sm">
      <div>
        <dt class="text-muted">
          Attendance this term
        </dt>
        <dd :data-testid="`my-child-attendance-${child.admissionNumber}`">
          {{ child.attendanceRate === null ? 'Not taken yet' : `${child.attendanceRate}% · ${absent}` }}
        </dd>
      </div>
      <div>
        <dt class="text-muted">
          Fees this term
        </dt>
        <dd
          :data-testid="`my-child-fees-${child.admissionNumber}`"
          :class="fees?.class"
          class="font-medium"
        >
          {{ fees?.label ?? 'No bill yet' }}
        </dd>
      </div>
    </dl>
    <ULink
      v-if="child.latestReportCard"
      :to="`/students/${child.id}/report-card?term=${child.latestReportCard.termId}`"
      :data-testid="`my-child-report-${child.admissionNumber}`"
      class="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary"
    >
      <UIcon name="i-lucide-file-text" />Report card · {{ child.latestReportCard.term }}
    </ULink>
  </UCard>
</template>
