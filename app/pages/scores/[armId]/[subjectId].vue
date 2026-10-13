<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import { TERM_LABELS } from '#shared/constants/academics'
import type { NurseryRating } from '#shared/constants/traits'
import type { ScoreChange } from '~/components/scores/ScoreGrid.vue'

definePageMeta({ roles: ['admin', 'principal', 'teacher'] })

type Sheet = InternalApi['/api/scores/sheet']['get']

const route = useRoute()
const toast = useToast()
const confirm = useConfirmDialog()

const query = computed(() => ({
  classArmId: String(route.params.armId),
  subjectId: String(route.params.subjectId),
  ...(typeof route.query.term === 'string' ? { termId: route.query.term } : {}),
}))
// useRequestFetch: during SSR a bare $fetch doesn't forward the request (decision 031)
const requestFetch = useRequestFetch()
const { data: sheet, refresh, error } = await useAsyncData('score-sheet', () => requestFetch<Sheet>('/api/scores/sheet', { query: query.value }), { watch: [query] })
useHead({ title: () => sheet.value ? `${sheet.value.subject.name} · ${sheet.value.arm.label}` : 'Scores' })

const saving = ref(false)
const dirty = ref(false)
const serverErrors = ref<Record<string, string>>({})

async function save(body: { entries?: ScoreChange[], ratings?: { studentId: string, rating: NurseryRating | null }[] }) {
  if (!sheet.value) return
  saving.value = true
  serverErrors.value = {}
  try {
    await $fetch('/api/scores/sheet', {
      method: 'PUT',
      body: { termId: sheet.value.term.id, classArmId: sheet.value.arm.id, subjectId: sheet.value.subject.id, ...body },
    })
    await refresh()
    refreshNuxtData('score-sheets')
    toast.add({ title: 'Scores saved', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (e) {
    const cellErrors = (e as { data?: { data?: { cellErrors?: { studentId: string, componentId?: string, message: string }[] } } }).data?.data?.cellErrors
    if (cellErrors) serverErrors.value = Object.fromEntries(cellErrors.map(c => [`${c.studentId}:${c.componentId}`, c.message]))
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// Don't lose typed scores: ask before leaving the page or closing the tab
onBeforeRouteLeave(async () => !dirty.value || await confirm({
  title: 'Leave without saving?',
  description: 'Your unsaved scores on this sheet will be lost.',
  confirmLabel: 'Leave',
}))
useEventListener(import.meta.client ? window : undefined, 'beforeunload', (event: BeforeUnloadEvent) => {
  if (dirty.value) event.preventDefault()
})
</script>

<template>
  <div class="mx-auto w-full max-w-5xl space-y-4">
    <UButton
      to="/scores"
      label="Score sheets"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      class="-ms-2.5"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="apiFormErrors(error)[0]?.message ?? apiErrorMessage(error)"
    />

    <template v-if="sheet">
      <div class="space-y-1">
        <h1
          data-testid="sheet-title"
          class="text-2xl font-semibold"
        >
          {{ sheet.subject.name }} · {{ sheet.arm.label }}
        </h1>
        <p class="text-sm text-muted">
          {{ sheet.term.sessionName }} {{ TERM_LABELS[sheet.term.number] }} · {{ sheet.students.length }} {{ sheet.students.length === 1 ? 'student' : 'students' }}
        </p>
      </div>

      <UAlert
        v-if="!sheet.canEdit"
        data-testid="sheet-readonly"
        color="warning"
        variant="subtle"
        icon="i-lucide-lock"
        :title="sheet.readOnlyReason === 'Locked' ? 'These scores are locked' : sheet.readOnlyReason === 'Earlier session' ? 'This term is in an earlier session' : 'You can only change the current term'"
        :description="sheet.readOnlyReason === 'Locked' ? 'Ask the principal or an admin to unlock this class.' : undefined"
      />
      <UAlert
        v-if="sheet.skippedNoDepartment"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        :title="`${sheet.skippedNoDepartment} ${sheet.skippedNoDepartment === 1 ? 'student has' : 'students have'} no department, so ${sheet.skippedNoDepartment === 1 ? 'isn\'t' : 'aren\'t'} listed for this department subject.`"
      />

      <p
        v-if="!sheet.students.length"
        class="text-sm text-muted"
      >
        No students take this subject in {{ sheet.arm.label }}.
      </p>
      <ScoresScoreGrid
        v-else-if="sheet.mode === 'scores'"
        :components="sheet.components"
        :bands="sheet.bands"
        :students="sheet.students"
        :readonly="!sheet.canEdit"
        :saving="saving"
        :server-errors="serverErrors"
        @save="entries => save({ entries })"
        @dirty="value => dirty = value"
      />
      <ScoresRatingGrid
        v-else
        :students="sheet.students"
        :readonly="!sheet.canEdit"
        :saving="saving"
        @save="ratings => save({ ratings })"
        @dirty="value => dirty = value"
      />
    </template>
  </div>
</template>
