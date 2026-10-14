<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import { PROMOTION_OUTCOME_LABELS, PROMOTION_OUTCOMES, type PromotionOutcome, type PromotionRow, validatePromotion } from '#shared/utils/promotion'

type ArmPromotion = InternalApi['/api/promotion/:armId']['get']

// One class's promotion: an outcome and target class per student (defaults from the server), checked with the
// same rules as the API; read-only once promoted. The page does the saving.
const props = defineProps<{ data: ArmPromotion }>()
const emit = defineEmits<{ promote: [rows: PromotionRow[]], undo: [] }>()

const readOnly = computed(() => !!props.data.promotion || !props.data.to)
const fromArm = computed(() => props.data.arms.find(a => a.id === props.data.arm.id)!)
const levelIndex = (levelId: string) => props.data.levels.findIndex(l => l.id === levelId)

// Students already in a class next session are skipped (they keep that class)
const skipped = computed(() => new Set(props.data.promotion ? [] : props.data.students.filter(s => s.enrolledNext).map(s => s.id)))
const defaults = new Map(props.data.students.map(s => [s.id, { outcome: s.outcome, toClassArmId: s.toClassArmId }]))
const rows = ref<PromotionRow[]>(props.data.students.map(s => ({ studentId: s.id, outcome: s.outcome ?? 'promoted', toClassArmId: s.toClassArmId })))
watch(() => props.data, (data) => {
  rows.value = data.students.map(s => ({ studentId: s.id, outcome: s.outcome ?? 'promoted', toClassArmId: s.toClassArmId }))
})

const outcomeItems = PROMOTION_OUTCOMES.map(value => ({ label: PROMOTION_OUTCOME_LABELS[value], value }))
function targetItems(outcome: PromotionOutcome) {
  const from = levelIndex(fromArm.value.classLevelId)
  return props.data.arms
    .filter(a => outcome === 'repeated' ? a.classLevelId === fromArm.value.classLevelId : levelIndex(a.classLevelId) > from)
    .map(a => ({ label: a.label, value: a.id }))
}

function setOutcome(row: PromotionRow, outcome: PromotionOutcome) {
  row.outcome = outcome
  const original = defaults.get(row.studentId)
  if (outcome === 'graduated' || outcome === 'withdrawn') row.toClassArmId = null
  else if (outcome === 'repeated') row.toClassArmId = fromArm.value.id
  else row.toClassArmId = original?.outcome === 'promoted' ? original.toClassArmId : null
}
const setAll = (outcome: PromotionOutcome) => rows.value.forEach(row => setOutcome(row, outcome))

const errors = computed(() => readOnly.value
  ? []
  : validatePromotion(rows.value.filter(r => !skipped.value.has(r.studentId)), { levels: props.data.levels, arms: props.data.arms, fromArm: fromArm.value }))
const errorFor = (studentId: string) => errors.value.find(e => e.studentId === studentId)?.message
const summary = computed(() => {
  const counted = rows.value.filter(r => !skipped.value.has(r.studentId))
  const parts = PROMOTION_OUTCOMES.map((o) => {
    const n = counted.filter(r => r.outcome === o).length
    return n ? `${n} ${{ promoted: 'promoted', repeated: 'repeating', graduated: 'graduating', withdrawn: 'withdrawn' }[o]}` : null
  }).filter(Boolean)
  if (skipped.value.size) parts.push(`${skipped.value.size} already placed`)
  return parts.join(' · ')
})
const studentName = (id: string) => props.data.students.find(s => s.id === id)!
const armLabel = (id: string | null | undefined) => props.data.arms.find(a => a.id === id)?.label ?? '—'
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="!data.to"
      data-testid="promotion-no-session"
      color="warning"
      variant="subtle"
      title="Create the next session in Calendar first"
    />
    <UAlert
      v-else-if="!data.resultsPublished && !data.promotion"
      data-testid="promotion-results-warning"
      color="neutral"
      variant="subtle"
      title="Third-term results for this class aren't published yet"
      description="You can still promote; averages show once results are published."
    />
    <div
      v-if="data.promotion"
      data-testid="promotion-done"
      class="flex flex-wrap items-center gap-2"
    >
      <UBadge
        label="Promoted"
        color="success"
        variant="subtle"
      />
      <span class="text-sm text-muted">by {{ data.promotion.by ?? '—' }} · {{ formatDateTime(data.promotion.at) }}</span>
      <UButton
        v-if="data.canUndo"
        data-testid="promotion-undo"
        label="Undo"
        icon="i-lucide-undo-2"
        color="neutral"
        variant="outline"
        size="sm"
        @click="emit('undo')"
      />
    </div>

    <div
      v-if="!readOnly"
      class="flex flex-wrap items-center gap-2"
    >
      <span class="text-sm text-muted">Set all to</span>
      <UButton
        v-for="item in outcomeItems"
        :key="item.value"
        :label="item.label"
        size="xs"
        color="neutral"
        variant="outline"
        :data-testid="`promotion-all-${item.value}`"
        @click="setAll(item.value)"
      />
    </div>

    <ul
      data-testid="promotion-rows"
      class="divide-y divide-default rounded-md border border-default"
    >
      <li
        v-for="row in rows"
        :key="row.studentId"
        :data-testid="`promotion-row-${studentName(row.studentId).admissionNumber}`"
        class="flex flex-wrap items-center gap-2 p-3"
      >
        <div class="min-w-0 flex-1 basis-48">
          <p class="font-medium">
            {{ studentName(row.studentId).name }}
          </p>
          <p class="text-sm text-muted">
            {{ studentName(row.studentId).admissionNumber }} · Average {{ studentName(row.studentId).average ?? '—' }}
          </p>
        </div>
        <p
          v-if="skipped.has(row.studentId)"
          class="text-sm text-muted"
        >
          Already in {{ studentName(row.studentId).enrolledNext }} next session — skipped
        </p>
        <p
          v-else-if="readOnly && data.promotion"
          data-testid="promotion-outcome"
          class="text-sm"
        >
          {{ studentName(row.studentId).outcome ? PROMOTION_OUTCOME_LABELS[studentName(row.studentId).outcome!] : 'Skipped' }}{{ row.toClassArmId ? ` → ${armLabel(row.toClassArmId)}` : '' }}
        </p>
        <template v-else-if="!readOnly">
          <USelect
            :model-value="row.outcome"
            :items="outcomeItems"
            data-testid="promotion-outcome-select"
            class="w-full sm:w-36"
            @update:model-value="(value: PromotionOutcome) => setOutcome(row, value)"
          />
          <USelect
            v-if="row.outcome === 'promoted' || row.outcome === 'repeated'"
            :model-value="row.toClassArmId ?? undefined"
            :items="targetItems(row.outcome)"
            placeholder="Choose a class"
            data-testid="promotion-target-select"
            class="w-full sm:w-40"
            @update:model-value="(value: string) => row.toClassArmId = value"
          />
          <p
            v-if="errorFor(row.studentId)"
            data-testid="promotion-row-error"
            class="w-full text-sm text-error"
          >
            {{ errorFor(row.studentId) }}
          </p>
        </template>
      </li>
    </ul>

    <div
      v-if="!readOnly"
      class="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-default bg-default py-3"
    >
      <p
        data-testid="promotion-summary"
        class="text-sm"
      >
        {{ summary }}
      </p>
      <UButton
        data-testid="promotion-confirm"
        :label="`Promote into ${data.to?.name}`"
        icon="i-lucide-circle-arrow-up"
        :disabled="errors.length > 0"
        @click="emit('promote', rows)"
      />
    </div>
  </div>
</template>
