<script setup lang="ts">
import { type GradedSection, SECTION_LABELS } from '#shared/constants/academics'
import { validateGradeBands } from '#shared/utils/grading'

const props = defineProps<{
  section: GradedSection
  bands: { grade: string, minScore: number, maxScore: number, remark: string }[]
}>()
const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
type Row = { grade: string, minScore: number | null, maxScore: number | null, remark: string }
const rows = ref<Row[]>([])
watch(() => props.bands, (bands) => {
  rows.value = bands.map(({ grade, minScore, maxScore, remark }) => ({ grade, minScore, maxScore, remark }))
}, { immediate: true })

const normalised = computed(() => rows.value.map(r => ({
  grade: r.grade,
  minScore: r.minScore ?? Number.NaN,
  maxScore: r.maxScore ?? Number.NaN,
  remark: r.remark,
})))
const errors = computed(() => validateGradeBands(normalised.value))
const saving = ref(false)

function addRow() {
  rows.value.push({ grade: '', minScore: null, maxScore: null, remark: '' })
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
}

async function save() {
  saving.value = true
  try {
    await $fetch(`/api/grading-scales/${props.section}`, { method: 'PUT', body: { bands: normalised.value } })
    toast.add({ title: `${SECTION_LABELS[props.section]} grading scale saved`, color: 'success', icon: 'i-lucide-circle-check' })
    emit('saved')
  }
  catch (e) {
    toast.add({ title: apiFormErrors(e)[0]?.message ?? apiErrorMessage(e), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="hidden grid-cols-[5rem_6rem_6rem_1fr_2.5rem] gap-2 text-xs font-medium text-muted sm:grid">
      <span>Grade</span><span>From</span><span>To</span><span>Remark</span><span />
    </div>
    <div
      v-for="(row, index) in rows"
      :key="index"
      data-testid="band-row"
      class="grid grid-cols-[5rem_1fr_1fr_2.5rem] gap-2 sm:grid-cols-[5rem_6rem_6rem_1fr_2.5rem]"
    >
      <UInput
        v-model="row.grade"
        :aria-label="`Band ${index + 1} grade`"
        placeholder="A1"
      />
      <UInputNumber
        v-model="row.minScore"
        :aria-label="`Band ${index + 1} lowest score`"
        :min="0"
        :max="100"
      />
      <UInputNumber
        v-model="row.maxScore"
        :aria-label="`Band ${index + 1} highest score`"
        :min="0"
        :max="100"
      />
      <UInput
        v-model="row.remark"
        :aria-label="`Band ${index + 1} remark`"
        placeholder="Excellent"
        class="col-span-3 sm:col-span-1"
      />
      <UButton
        data-testid="remove-band"
        icon="i-lucide-x"
        :aria-label="`Remove band ${row.grade || index + 1}`"
        color="neutral"
        variant="ghost"
        class="col-start-4 row-start-1 sm:col-start-auto sm:row-start-auto"
        @click="removeRow(index)"
      />
    </div>

    <UButton
      label="Add band"
      icon="i-lucide-plus"
      color="neutral"
      variant="outline"
      size="sm"
      @click="addRow"
    />

    <ul
      v-if="errors.length"
      data-testid="grading-errors"
      class="list-inside list-disc text-sm text-error"
    >
      <li
        v-for="message in errors"
        :key="message"
      >
        {{ message }}
      </li>
    </ul>

    <UButton
      data-testid="grading-save"
      :label="`Save ${SECTION_LABELS[section]} scale`"
      :loading="saving"
      :disabled="errors.length > 0"
      @click="save"
    />
  </div>
</template>
