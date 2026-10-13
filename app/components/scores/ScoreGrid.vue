<script setup lang="ts">
import { gradeFor, parseScoreCell, type ScoreCell, sheetTotal } from '#shared/utils/scores'

type Component = { id: string, name: string, maxScore: number }
type Band = { grade: string, minScore: number, maxScore: number, remark: string }
type SheetStudent = { id: string, name: string, admissionNumber: string, photoUrl: string | null, cells: Record<string, ScoreCell> }
export type ScoreChange = { studentId: string, componentId: string, value: number | 'ABS' | null }

// Keyboard-friendly score grid: Enter/↓ next student, ↑ previous, Tab next cell. Cells are checked as typed
// (shared rules); only changed cells are emitted on save.
const props = defineProps<{
  components: Component[]
  bands: Band[]
  students: SheetStudent[]
  readonly?: boolean
  saving?: boolean
  /** Server-side problems after a save, keyed `${studentId}:${componentId}` */
  serverErrors?: Record<string, string>
}>()
const emit = defineEmits<{ save: [changes: ScoreChange[]], dirty: [dirty: boolean] }>()

const key = (studentId: string, componentId: string) => `${studentId}:${componentId}`
const asText = (cell: ScoreCell | undefined) => !cell ? '' : cell.absent ? 'ABS' : cell.score === null ? '' : String(cell.score)

const original = ref<Record<string, string>>({})
const values = ref<Record<string, string>>({})
watch(() => props.students, (students) => {
  const texts = Object.fromEntries(students.flatMap(s => props.components.map(c => [key(s.id, c.id), asText(s.cells[c.id])])))
  original.value = texts
  values.value = { ...texts }
}, { immediate: true })

const parsed = computed(() => Object.fromEntries(props.students.flatMap(s => props.components.map((c) => {
  const k = key(s.id, c.id)
  return [k, parseScoreCell(values.value[k] ?? '', c.maxScore)]
}))))
const canonical = (k: string) => {
  const result = parsed.value[k]!
  return result.ok ? asText(result.value) : values.value[k] ?? ''
}
const dirtyKeys = computed(() => Object.keys(values.value).filter(k => canonical(k) !== (original.value[k] ?? '')))
const errorCount = computed(() => Object.values(parsed.value).filter(r => !r.ok).length)
watch(() => dirtyKeys.value.length > 0, dirty => emit('dirty', dirty), { immediate: true })

const errorFor = (k: string) => {
  const result = parsed.value[k]
  if (result && !result.ok) return result.message
  return dirtyKeys.value.includes(k) ? undefined : props.serverErrors?.[k]
}
function totalOf(student: SheetStudent) {
  return sheetTotal(props.components.map((c) => {
    const result = parsed.value[key(student.id, c.id)]!
    return result.ok ? result.value : null
  }))
}

const grid = useTemplateRef('grid')
function focusCell(row: number, col: number) {
  const input = grid.value?.querySelector<HTMLInputElement>(`[data-cell="${row}-${col}"]`)
  input?.focus()
  input?.select()
}
function onKeydown(event: KeyboardEvent, row: number, col: number) {
  if (event.key === 'Enter' || event.key === 'ArrowDown') {
    event.preventDefault()
    focusCell(row + 1, col)
  }
  else if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusCell(row - 1, col)
  }
}

function save() {
  emit('save', dirtyKeys.value.map((k) => {
    const [studentId, componentId] = k.split(':') as [string, string]
    const result = parsed.value[k]!
    const value = result.ok ? result.value : { score: null, absent: false }
    return { studentId, componentId, value: value.absent ? 'ABS' as const : value.score }
  }))
}
</script>

<template>
  <div class="space-y-3">
    <div
      ref="grid"
      class="overflow-x-auto rounded-md border border-default"
    >
      <table class="w-full min-w-max border-collapse text-sm">
        <thead class="bg-elevated">
          <tr>
            <th class="sticky left-0 z-10 bg-elevated px-3 py-2 text-left font-medium">
              Student
            </th>
            <th
              v-for="component in components"
              :key="component.id"
              class="px-2 py-2 text-center font-medium"
            >
              {{ component.name }}<span class="block text-xs font-normal text-muted">/{{ component.maxScore }}</span>
            </th>
            <th class="px-2 py-2 text-center font-medium">
              Total
            </th>
            <th class="px-2 py-2 text-center font-medium">
              Grade
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(student, row) in students"
            :key="student.id"
            :data-testid="`score-row-${student.admissionNumber}`"
            class="border-t border-default align-top"
          >
            <td class="sticky left-0 z-10 max-w-40 bg-default px-3 py-2">
              <p class="truncate font-medium">
                {{ student.name }}
              </p>
              <p class="truncate text-xs text-muted">
                {{ student.admissionNumber }}
              </p>
            </td>
            <td
              v-for="(component, col) in components"
              :key="component.id"
              class="px-1 py-1.5 text-center"
            >
              <UInput
                v-model="values[key(student.id, component.id)]"
                :data-cell="`${row}-${col}`"
                :data-testid="`cell-${row}-${col}`"
                :aria-label="`${component.name} for ${student.name}`"
                :aria-invalid="!!errorFor(key(student.id, component.id))"
                inputmode="numeric"
                autocomplete="off"
                :disabled="readonly"
                :color="errorFor(key(student.id, component.id)) ? 'error' : 'primary'"
                :highlight="!!errorFor(key(student.id, component.id)) || dirtyKeys.includes(key(student.id, component.id))"
                :ui="{ base: 'w-16 text-center' }"
                @keydown="onKeydown($event, row, col)"
              />
              <p
                v-if="errorFor(key(student.id, component.id))"
                :data-testid="`cell-error-${row}-${col}`"
                class="mt-0.5 max-w-24 text-xs text-error"
              >
                {{ errorFor(key(student.id, component.id)) }}
              </p>
            </td>
            <td
              :data-testid="`total-${row}`"
              class="px-2 py-2 text-center font-medium"
            >
              {{ totalOf(student) ?? '—' }}
            </td>
            <td
              :data-testid="`grade-${row}`"
              class="px-2 py-2 text-center"
            >
              {{ gradeFor(totalOf(student), bands)?.grade ?? '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="!readonly"
      class="flex flex-wrap items-center gap-3"
    >
      <UButton
        data-testid="scores-save"
        :label="dirtyKeys.length ? `Save ${dirtyKeys.length} ${dirtyKeys.length === 1 ? 'change' : 'changes'}` : 'Save'"
        icon="i-lucide-save"
        :loading="saving"
        :disabled="!dirtyKeys.length || errorCount > 0"
        @click="save"
      />
      <p
        v-if="errorCount"
        data-testid="scores-error-count"
        class="text-sm text-error"
      >
        Fix {{ errorCount }} {{ errorCount === 1 ? 'cell' : 'cells' }} before saving.
      </p>
      <p
        v-else
        class="text-sm text-muted"
      >
        Type ABS for an absent student. Enter moves down.
      </p>
    </div>
  </div>
</template>
