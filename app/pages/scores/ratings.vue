<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import { TERM_LABELS } from '#shared/constants/academics'
import type { TraitKey } from '#shared/constants/traits'

definePageMeta({ roles: ['admin', 'principal', 'teacher'] })
useHead({ title: 'Ratings & comments' })

type RatingsSheet = InternalApi['/api/ratings/sheet']['get']

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirmDialog()
const { user } = useUserSession()

// Class teachers' arms (admin and principal: every arm) — the same list as for attendance
const { data: armList } = await useFetch('/api/attendance/arms', { key: 'attendance-arms' })
const arms = computed(() => armList.value?.arms ?? [])
const armId = computed(() => typeof route.query.arm === 'string' ? route.query.arm : arms.value.length === 1 ? arms.value[0]!.id : undefined)
const selectedArm = computed({
  get: () => armId.value,
  set: value => router.replace({ query: { ...route.query, arm: value } }),
})
const armItems = computed(() => arms.value.map(a => ({ label: a.label, value: a.id })))

const requestFetch = useRequestFetch()
const { data: sheet, refresh, error } = await useAsyncData('ratings-sheet',
  () => armId.value ? requestFetch<RatingsSheet>('/api/ratings/sheet', { query: { classArmId: armId.value } }) : Promise.resolve(null),
  { watch: [armId] })

type Draft = { ratings: Partial<Record<TraitKey, number | null>>, comment: string }
const drafts = ref<Record<string, Draft>>({})
const saved = ref<Record<string, string>>({})
const snapshot = (d: Draft) => JSON.stringify({ r: Object.entries(d.ratings).filter(([, v]) => v != null).sort(), c: d.comment.trim() })
watch(sheet, (value) => {
  const fresh = Object.fromEntries((value?.students ?? []).map(s => [s.id, { ratings: { ...s.ratings }, comment: s.comment ?? '' } satisfies Draft]))
  drafts.value = fresh
  saved.value = Object.fromEntries(Object.entries(fresh).map(([id, d]) => [id, snapshot(d)]))
}, { immediate: true })
const changedIds = computed(() => Object.keys(drafts.value).filter(id => snapshot(drafts.value[id]!) !== saved.value[id]))
const allTraits = computed(() => sheet.value ? [...sheet.value.traits.affective, ...sheet.value.traits.psychomotor] : [])
const ratedCount = (id: string) => Object.values(drafts.value[id]?.ratings ?? {}).filter(v => v != null).length

function rate(studentId: string, trait: TraitKey, value: number) {
  const draft = drafts.value[studentId]!
  draft.ratings[trait] = draft.ratings[trait] === value ? null : value
}

const saving = ref(false)
async function save() {
  if (!sheet.value) return
  saving.value = true
  try {
    await $fetch('/api/ratings/sheet', {
      method: 'PUT',
      body: {
        termId: sheet.value.term.id,
        classArmId: sheet.value.arm.id,
        students: changedIds.value.map((studentId) => {
          const draft = drafts.value[studentId]!
          // Every trait: a value, or null to clear one that was rated before
          return { studentId, ratings: Object.fromEntries(allTraits.value.map(t => [t.key, draft.ratings[t.key] ?? null])), comment: draft.comment }
        }),
      },
    })
    await refresh()
    toast.add({ title: 'Ratings saved', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

onBeforeRouteLeave(async () => !changedIds.value.length || await confirm({
  title: 'Leave without saving?',
  description: 'Your unsaved ratings and comments will be lost.',
  confirmLabel: 'Leave',
}))
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <UButton
      to="/scores"
      label="Score sheets"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      class="-ms-2.5"
    />
    <h1 class="text-2xl font-semibold">
      Ratings & comments
    </h1>

    <UAlert
      v-if="!arms.length"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :title="user?.role === 'teacher' ? 'Ratings and comments are entered by class teachers. You\'re not a class teacher this session.' : 'No classes yet for the current session.'"
    />

    <template v-else>
      <USelect
        v-if="arms.length > 1"
        v-model="selectedArm"
        data-testid="ratings-arm"
        :items="armItems"
        placeholder="Choose a class"
        class="w-full sm:w-60"
      />
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        :title="apiErrorMessage(error)"
      />

      <template v-if="sheet">
        <p class="text-sm text-muted">
          {{ sheet.arm.label }} · {{ sheet.term.sessionName }} {{ TERM_LABELS[sheet.term.number] }} · rate 1 (poor) to 5 (excellent); tap again to clear
        </p>
        <UAlert
          v-if="!sheet.canEdit"
          color="warning"
          variant="subtle"
          icon="i-lucide-lock"
          :title="sheet.readOnlyReason === 'Locked' ? 'These ratings are locked' : 'You can only change the current term'"
        />

        <UCollapsible
          v-for="student in sheet.students"
          :key="student.id"
          :data-testid="`ratings-student-${student.admissionNumber}`"
          class="rounded-md border border-default"
        >
          <UButton
            color="neutral"
            variant="ghost"
            block
            class="justify-between px-3 py-2"
            trailing-icon="i-lucide-chevron-down"
          >
            <span class="min-w-0 truncate text-left font-medium">{{ student.name }}</span>
            <span class="ms-auto text-xs text-muted">
              {{ ratedCount(student.id) }}/{{ allTraits.length }} rated{{ drafts[student.id]?.comment.trim() ? ' · comment' : '' }}
            </span>
          </UButton>
          <template #content>
            <div class="space-y-4 border-t border-default p-3">
              <div
                v-for="group in [{ title: 'Affective', traits: sheet.traits.affective }, { title: 'Psychomotor', traits: sheet.traits.psychomotor }]"
                :key="group.title"
                class="space-y-2"
              >
                <h3 class="text-sm font-medium text-muted">
                  {{ group.title }}
                </h3>
                <div
                  v-for="trait in group.traits"
                  :key="trait.key"
                  class="flex flex-wrap items-center justify-between gap-2"
                >
                  <span class="text-sm">{{ trait.label }}</span>
                  <UFieldGroup size="sm">
                    <UButton
                      v-for="n in 5"
                      :key="n"
                      :data-testid="`rate-${trait.key}-${n}`"
                      :label="String(n)"
                      :aria-label="`${trait.label}: ${n}`"
                      :aria-pressed="drafts[student.id]?.ratings[trait.key] === n"
                      :variant="drafts[student.id]?.ratings[trait.key] === n ? 'solid' : 'outline'"
                      :color="drafts[student.id]?.ratings[trait.key] === n ? 'primary' : 'neutral'"
                      :disabled="!sheet.canEdit"
                      class="w-9 justify-center"
                      @click="rate(student.id, trait.key, n)"
                    />
                  </UFieldGroup>
                </div>
              </div>
              <UFormField
                label="Class teacher's comment"
                :help="`${drafts[student.id]?.comment.length ?? 0}/500`"
              >
                <UTextarea
                  v-if="drafts[student.id]"
                  v-model="drafts[student.id]!.comment"
                  data-testid="ratings-comment"
                  :rows="2"
                  :maxlength="500"
                  :disabled="!sheet.canEdit"
                  class="w-full"
                />
              </UFormField>
            </div>
          </template>
        </UCollapsible>

        <div
          v-if="sheet.canEdit"
          class="sticky bottom-0 -mx-4 border-t border-default bg-default/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0"
        >
          <UButton
            data-testid="ratings-save"
            :label="changedIds.length ? `Save ${changedIds.length} ${changedIds.length === 1 ? 'student' : 'students'}` : 'Save'"
            icon="i-lucide-save"
            :loading="saving"
            :disabled="!changedIds.length"
            @click="save"
          />
        </div>
      </template>
    </template>
  </div>
</template>
