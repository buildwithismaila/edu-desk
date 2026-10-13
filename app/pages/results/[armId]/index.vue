<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import { z } from 'zod'
import { TERM_LABELS } from '#shared/constants/academics'
import type { ResultAction } from '#shared/utils/results'

definePageMeta({ roles: ['admin', 'principal', 'teacher'] })

type Results = InternalApi['/api/results']['get']

const route = useRoute()
const toast = useToast()
const confirm = useConfirmDialog()
const askReason = useNameDialog()
const { user } = useUserSession()

const query = computed(() => ({
  classArmId: String(route.params.armId),
  ...(typeof route.query.term === 'string' ? { termId: route.query.term } : {}),
}))
// useRequestFetch: during SSR a bare $fetch doesn't forward the request (decision 031)
const requestFetch = useRequestFetch()
const { data: results, refresh, error } = await useAsyncData('arm-results', () => requestFetch<Results>('/api/results', { query: query.value }), { watch: [query] })
useHead({ title: () => results.value ? `Results · ${results.value.arm.label}` : 'Results' })

const STATUS = {
  draft: { label: 'Draft', color: 'neutral' },
  submitted: { label: 'Submitted', color: 'warning' },
  published: { label: 'Published', color: 'success' },
} as const
const termQuery = computed(() => results.value ? `?term=${results.value.term.id}` : '')
const ordinal = (n: number | null) => n === null ? '—' : `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`

const busy = ref(false)
const CONFIRM: Record<Exclude<ResultAction, 'return'>, { title: string, description: string, label: string }> = {
  submit: { title: 'Submit these results?', description: 'Scores, ratings and comments will be locked while the principal reviews them.', label: 'Submit' },
  publish: { title: 'Publish these results?', description: 'Report cards are frozen as they are now, and parents can see them.', label: 'Publish' },
  unpublish: { title: 'Unpublish these results?', description: 'Parents won\'t see the report cards any more. Scores stay locked until you return the results to draft.', label: 'Unpublish' },
}

async function run(action: ResultAction) {
  if (!results.value) return
  const body = { termId: results.value.term.id, classArmId: results.value.arm.id }
  if (action === 'return') {
    const returned = await askReason({
      title: 'Return to draft',
      label: 'Reason (the class teacher sees this)',
      placeholder: 'e.g. Recheck Mathematics CA2',
      schema: z.string().trim().min(3, 'Say why the results are being returned').max(500),
      submit: reason => $fetch('/api/results/return', { method: 'POST', body: { ...body, reason } }),
    })
    if (returned) await after('Results returned to draft')
    return
  }
  const text = CONFIRM[action]
  if (!await confirm({ title: text.title, description: text.description, confirmLabel: text.label })) return
  busy.value = true
  try {
    await $fetch(`/api/results/${action}`, { method: 'POST', body })
    await after({ submit: 'Results submitted', publish: 'Results published', unpublish: 'Results unpublished' }[action])
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
    await refresh()
  }
  finally {
    busy.value = false
  }
}
async function after(message: string) {
  await refresh()
  refreshNuxtData('result-arms')
  toast.add({ title: message, color: 'success', icon: 'i-lucide-circle-check' })
}

// Principal's comments (admin/principal, before publishing)
const canComment = computed(() => !!results.value?.viewer.lead && results.value.status !== 'published' && results.value.term.sessionIsCurrent)
const comments = ref<Record<string, string>>({})
watch(results, (value) => {
  comments.value = Object.fromEntries((value?.students ?? []).map(s => [s.id, s.principalComment ?? '']))
}, { immediate: true })
const changedComments = computed(() => (results.value?.students ?? []).filter(s => (comments.value[s.id] ?? '').trim() !== (s.principalComment ?? '')))
const savingComments = ref(false)
async function saveComments() {
  if (!results.value) return
  savingComments.value = true
  try {
    await $fetch('/api/results/principal-comments', {
      method: 'PUT',
      body: {
        termId: results.value.term.id,
        classArmId: results.value.arm.id,
        comments: changedComments.value.map(s => ({ studentId: s.id, comment: comments.value[s.id] ?? '' })),
      },
    })
    await refresh()
    toast.add({ title: 'Comments saved', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
  finally {
    savingComments.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-4xl space-y-4">
    <UButton
      to="/results"
      label="All classes"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      class="-ms-2.5"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="apiErrorMessage(error)"
    />

    <template v-if="results">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-1">
          <h1 class="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {{ results.arm.label }}
            <UBadge
              data-testid="results-status"
              :label="STATUS[results.status].label"
              :color="STATUS[results.status].color"
              variant="subtle"
            />
          </h1>
          <p class="text-sm text-muted">
            {{ TERM_LABELS[results.term.number] }} · {{ results.term.sessionName }} · {{ results.numberInClass }} {{ results.numberInClass === 1 ? 'student' : 'students' }}
          </p>
          <p
            v-if="results.published"
            class="text-sm text-muted"
          >
            Published by {{ results.published.by ?? 'a former user' }} on {{ formatDateTime(results.published.at) }}
          </p>
          <p
            v-else-if="results.status === 'submitted' && results.submitted"
            class="text-sm text-muted"
          >
            Submitted by {{ results.submitted.by ?? 'a former user' }} on {{ formatDateTime(results.submitted.at) }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            :to="`/results/${results.arm.id}/report-cards${termQuery}`"
            target="_blank"
            data-testid="results-report-cards"
            label="Report cards"
            icon="i-lucide-printer"
            color="neutral"
            variant="outline"
          />
          <UButton
            v-if="results.mode === 'scores'"
            :to="`/results/${results.arm.id}/broadsheet${termQuery}`"
            target="_blank"
            label="Broadsheet"
            icon="i-lucide-table"
            color="neutral"
            variant="outline"
          />
        </div>
      </div>

      <UAlert
        v-if="results.returnedReason"
        data-testid="results-returned"
        color="warning"
        variant="subtle"
        icon="i-lucide-undo-2"
        title="Returned to draft"
        :description="results.returnedReason"
      />

      <UAlert
        v-if="results.completeness.length"
        data-testid="results-incomplete"
        color="warning"
        variant="subtle"
        icon="i-lucide-list-checks"
        title="Some scores are missing"
      >
        <template #description>
          <ul class="mt-1 space-y-1">
            <li
              v-for="gap in results.completeness"
              :key="gap.subjectId"
            >
              <strong>{{ gap.subjectName }}:</strong>
              {{ gap.missing.map(m => `${m.name} (${m.components.join(', ')})`).join('; ') }}
            </li>
          </ul>
        </template>
      </UAlert>

      <ResultsActions
        v-if="user && results.term.sessionIsCurrent"
        :status="results.status"
        :role="user.role"
        :is-class-teacher="results.viewer.isClassTeacher"
        :busy="busy"
        @action="run"
      />

      <UCard>
        <div class="overflow-x-auto">
          <table
            data-testid="results-table"
            class="w-full min-w-max text-sm"
          >
            <thead>
              <tr class="text-left text-muted">
                <th
                  v-if="results.showPositions && results.mode === 'scores'"
                  class="py-1 pe-3"
                >
                  Pos.
                </th>
                <th class="py-1 pe-3">
                  Student
                </th>
                <template v-if="results.mode === 'scores'">
                  <th class="py-1 pe-3 text-right">
                    Subjects
                  </th>
                  <th class="py-1 pe-3 text-right">
                    Total
                  </th>
                  <th class="py-1 text-right">
                    Average
                  </th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="student in results.students"
                :key="student.id"
                class="border-t border-default"
              >
                <td
                  v-if="results.showPositions && results.mode === 'scores'"
                  class="py-1.5 pe-3"
                >
                  {{ ordinal(student.position) }}
                </td>
                <td class="py-1.5 pe-3">
                  <ULink
                    :to="`/students/${student.id}/report-card${termQuery}`"
                    target="_blank"
                    class="font-medium text-highlighted"
                  >
                    {{ student.name }}
                  </ULink>
                </td>
                <template v-if="results.mode === 'scores'">
                  <td class="py-1.5 pe-3 text-right">
                    {{ student.offered }}
                  </td>
                  <td class="py-1.5 pe-3 text-right">
                    {{ student.total ?? '—' }}
                  </td>
                  <td class="py-1.5 text-right font-medium">
                    {{ student.average?.toFixed(2) ?? '—' }}
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <UCard v-if="canComment">
        <template #header>
          <h2 class="font-semibold">
            Principal's comments
          </h2>
        </template>
        <div class="space-y-3">
          <UFormField
            v-for="student in results.students"
            :key="student.id"
            :label="student.name"
          >
            <UTextarea
              v-model="comments[student.id]"
              :data-testid="`principal-comment-${student.admissionNumber}`"
              :rows="1"
              autoresize
              :maxlength="500"
              class="w-full"
            />
          </UFormField>
          <UButton
            data-testid="principal-comments-save"
            :label="changedComments.length ? `Save ${changedComments.length} ${changedComments.length === 1 ? 'comment' : 'comments'}` : 'Save comments'"
            :disabled="!changedComments.length"
            :loading="savingComments"
            @click="saveComments"
          />
        </div>
      </UCard>
    </template>
  </div>
</template>
