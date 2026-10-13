<script setup lang="ts">
import { NURSERY_RATINGS, type NurseryRating } from '#shared/constants/traits'

type SheetStudent = { id: string, name: string, admissionNumber: string, rating: NurseryRating | null }

// Nursery: one skill rating per student for the subject; only changed students are emitted on save.
const props = defineProps<{ students: SheetStudent[], readonly?: boolean, saving?: boolean }>()
const emit = defineEmits<{ save: [changes: { studentId: string, rating: NurseryRating | null }[]], dirty: [dirty: boolean] }>()

const NONE = 'none'
const items = [{ label: 'Not rated', value: NONE }, ...NURSERY_RATINGS.map(r => ({ label: r.label, value: r.value }))]
const values = ref<Record<string, string>>({})
watch(() => props.students, (students) => {
  values.value = Object.fromEntries(students.map(s => [s.id, s.rating ?? NONE]))
}, { immediate: true })
const changed = computed(() => props.students.filter(s => values.value[s.id] !== (s.rating ?? NONE)))
watch(() => changed.value.length > 0, dirty => emit('dirty', dirty), { immediate: true })

function save() {
  emit('save', changed.value.map(s => ({ studentId: s.id, rating: values.value[s.id] === NONE ? null : values.value[s.id] as NurseryRating })))
}
</script>

<template>
  <div class="space-y-3">
    <ul class="divide-y divide-default rounded-md border border-default">
      <li
        v-for="student in students"
        :key="student.id"
        class="flex flex-wrap items-center gap-3 px-3 py-2"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">
            {{ student.name }}
          </p>
          <p class="truncate text-xs text-muted">
            {{ student.admissionNumber }}
          </p>
        </div>
        <USelect
          v-model="values[student.id]"
          :items="items"
          :disabled="readonly"
          :aria-label="`Rating for ${student.name}`"
          class="w-48"
        />
      </li>
    </ul>
    <UButton
      v-if="!readonly"
      data-testid="ratings-save"
      :label="changed.length ? `Save ${changed.length} ${changed.length === 1 ? 'change' : 'changes'}` : 'Save'"
      icon="i-lucide-save"
      :loading="saving"
      :disabled="!changed.length"
      @click="save"
    />
  </div>
</template>
