<script setup lang="ts">
import { MAX_ASSESSMENT_COMPONENTS, validateAssessmentComponents } from '#shared/utils/assessment'

const props = defineProps<{ components: { name: string, maxScore: number }[] }>()
const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
const rows = ref<{ name: string, maxScore: number | null }[]>([])
watch(() => props.components, (components) => {
  rows.value = components.map(({ name, maxScore }) => ({ name, maxScore }))
}, { immediate: true })

const normalised = computed(() => rows.value.map(r => ({ name: r.name, maxScore: r.maxScore ?? Number.NaN })))
const total = computed(() => rows.value.reduce((sum, r) => sum + (r.maxScore ?? 0), 0))
const errors = computed(() => validateAssessmentComponents(normalised.value))
const saving = ref(false)

function addRow() {
  rows.value.push({ name: '', maxScore: null })
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
}

async function save() {
  saving.value = true
  try {
    await $fetch('/api/assessment-components', { method: 'PUT', body: { components: normalised.value } })
    toast.add({ title: 'Assessment split saved', color: 'success', icon: 'i-lucide-circle-check' })
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
    <div
      v-for="(row, index) in rows"
      :key="index"
      data-testid="assessment-row"
      class="flex items-center gap-2"
    >
      <UInput
        v-model="row.name"
        :aria-label="`Component ${index + 1} name`"
        placeholder="e.g. CA1"
        class="flex-1"
      />
      <UInputNumber
        v-model="row.maxScore"
        :aria-label="`Component ${index + 1} maximum`"
        :min="1"
        :max="100"
        class="w-28"
      />
      <UButton
        data-testid="remove-assessment-row"
        icon="i-lucide-x"
        :aria-label="`Remove component ${index + 1}`"
        color="neutral"
        variant="ghost"
        @click="removeRow(index)"
      />
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <UButton
        label="Add component"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        size="sm"
        :disabled="rows.length >= MAX_ASSESSMENT_COMPONENTS"
        @click="addRow"
      />
      <p
        data-testid="assessment-total"
        class="text-sm"
        :class="total === 100 ? 'text-success' : 'text-warning'"
      >
        Total: {{ total }} / 100
      </p>
    </div>

    <ul
      v-if="errors.length"
      data-testid="assessment-errors"
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
      data-testid="assessment-save"
      label="Save assessment split"
      :loading="saving"
      :disabled="errors.length > 0"
      @click="save"
    />
  </div>
</template>
