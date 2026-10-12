<script setup lang="ts">
import { GRADED_SECTIONS, type GradedSection, SECTION_LABELS } from '#shared/constants/academics'

definePageMeta({ roles: ['admin'] })
useHead({ title: 'Assessment & grading' })

const { data: components, refresh: refreshComponents } = await useFetch('/api/assessment-components')
const { data: scales, refresh: refreshScales } = await useFetch('/api/grading-scales')

const section = ref<GradedSection>('primary')
const tabs = GRADED_SECTIONS.map(s => ({ label: SECTION_LABELS[s], value: s }))
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6">
    <h1 class="text-2xl font-semibold">
      Assessment &amp; grading
    </h1>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          Assessment split
        </h2>
        <p class="text-sm text-muted">
          The parts of each subject's score. Maximums must add up to 100.
        </p>
      </template>
      <SettingsAssessmentEditor
        :components="components ?? []"
        @saved="refreshComponents"
      />
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          Grading scales
        </h2>
        <p class="text-sm text-muted">
          Bands must cover every score from 0 to 100 with no gaps or overlaps. Nursery uses skill ratings instead.
        </p>
      </template>
      <UTabs
        v-model="section"
        :items="tabs"
        :content="false"
        class="mb-4"
      />
      <SettingsGradingScaleEditor
        :key="section"
        :section="section"
        :bands="scales?.[section] ?? []"
        @saved="refreshScales"
      />
    </UCard>
  </div>
</template>
