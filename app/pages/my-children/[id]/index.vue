<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'

// A parent's child: published report cards, attendance and fees, read-only (docs/features/09-parent-portal.md).
definePageMeta({ roles: ['parent'] })

type Child = InternalApi['/api/me/children/:id']['get']

const route = useRoute()
const childId = String(route.params.id)
const requestFetch = useRequestFetch()
const { data: child, error } = await useAsyncData(`my-child-${childId}`, () => requestFetch<Child>(`/api/me/children/${childId}`))
useHead({ title: () => child.value?.name ?? 'My child' })

const tabs = [
  { label: 'Results', value: 'results', slot: 'results' as const, icon: 'i-lucide-award' },
  { label: 'Attendance', value: 'attendance', slot: 'attendance' as const, icon: 'i-lucide-clipboard-check' },
  { label: 'Fees', value: 'fees', slot: 'fees' as const, icon: 'i-lucide-wallet' },
]
// The tab is in the URL, so Back from a report card or receipt returns to it
const tab = computed({
  get: () => tabs.some(t => t.value === route.query.tab) ? String(route.query.tab) : 'results',
  set: value => navigateTo({ query: { ...route.query, tab: String(value) } }, { replace: true }),
})
</script>

<template>
  <div class="space-y-4">
    <UButton
      to="/"
      label="My children"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      class="-ms-2"
    />
    <p
      v-if="error"
      data-testid="child-not-found"
    >
      {{ error.statusCode === 404 ? 'Child not found.' : apiErrorMessage(error) }}
    </p>
    <template v-if="child">
      <div class="flex items-center gap-3">
        <UAvatar
          :src="child.photoUrl ?? undefined"
          :alt="child.name"
          size="xl"
        />
        <div class="min-w-0">
          <h1
            data-testid="child-name"
            class="text-2xl font-semibold"
          >
            {{ child.name }}
          </h1>
          <p class="text-sm text-muted">
            {{ child.classLabel ?? 'No class this session' }} · {{ child.admissionNumber }}
          </p>
        </div>
      </div>
      <UTabs
        v-model="tab"
        data-testid="child-tabs"
        :items="tabs"
        class="w-full"
      >
        <template #results>
          <ParentChildResults :child-id="child.id" />
        </template>
        <template #attendance>
          <ParentChildAttendance
            :child-id="child.id"
            :terms="child.attendanceTerms"
            :current-term-id="child.currentTermId"
          />
        </template>
        <template #fees>
          <ParentChildFees
            :child-id="child.id"
            :terms="child.feeTerms"
            :current-term-id="child.currentTermId"
          />
        </template>
      </UTabs>
    </template>
  </div>
</template>
