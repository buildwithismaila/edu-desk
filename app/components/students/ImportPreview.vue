<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

type ImportError = { row: number, column: string, message: string }

// The dry-run result: how many rows are ready and every problem. Import is only possible with no errors.
const props = defineProps<{ result: { valid: boolean, rows: number, errors: ImportError[] }, importing?: boolean }>()
const emit = defineEmits<{ import: [] }>()

const canImport = computed(() => props.result.valid && props.result.rows > 0)
const columns: TableColumn<ImportError>[] = [
  { accessorKey: 'row', header: 'Row' },
  { accessorKey: 'column', header: 'Column' },
  { accessorKey: 'message', header: 'Problem' },
]
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="result.valid"
      data-testid="import-ready"
      color="success"
      variant="subtle"
      icon="i-lucide-circle-check"
      :title="`${result.rows} ${result.rows === 1 ? 'student is' : 'students are'} ready to import`"
      description="New parents get accounts but no password yet: use Reset password on a student's profile when a parent wants to log in."
    />
    <template v-else>
      <UAlert
        data-testid="import-problems"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="`${result.errors.length} ${result.errors.length === 1 ? 'problem' : 'problems'} in the file`"
        description="Nothing has been imported. Fix these rows in your spreadsheet, save it as CSV and upload it again."
      />
      <UTable
        data-testid="import-errors"
        :data="result.errors"
        :columns="columns"
        class="max-h-96"
        sticky
      />
    </template>

    <UButton
      data-testid="import-confirm"
      :label="`Import ${result.rows} ${result.rows === 1 ? 'student' : 'students'}`"
      icon="i-lucide-upload"
      :disabled="!canImport"
      :loading="importing"
      @click="emit('import')"
    />
  </div>
</template>
