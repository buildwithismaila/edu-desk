<script setup lang="ts">
import { IMPORT_COLUMNS, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from '#shared/schemas/student-import'

definePageMeta({ roles: ['admin'] })
useHead({ title: 'Import students' })

type Preview = { valid: boolean, rows: number, errors: { row: number, column: string, message: string }[] }

const toast = useToast()
const { data: current } = await useCurrentTerm()

const file = ref<File | null>(null)
const preview = ref<Preview>()
const checking = ref(false)
const importing = ref(false)

const body = () => {
  const form = new FormData()
  form.append('file', file.value!)
  return form
}

// Check the file as soon as it's chosen (dry run: nothing is saved)
watch(file, async (chosen) => {
  preview.value = undefined
  if (!chosen) return
  if (chosen.size > IMPORT_MAX_BYTES) {
    toast.add({ title: 'The file must be 1 MB or smaller', color: 'error' })
    file.value = null
    return
  }
  checking.value = true
  try {
    preview.value = await $fetch<Preview>('/api/students/import', { method: 'POST', query: { dryRun: true }, body: body() })
  }
  catch (e) {
    toast.add({ title: apiFormErrors(e)[0]?.message ?? apiErrorMessage(e), color: 'error' })
    file.value = null
  }
  finally {
    checking.value = false
  }
})

async function runImport() {
  importing.value = true
  try {
    const result = await $fetch<{ imported: number, guardiansCreated: number, guardiansLinked: number }>('/api/students/import', { method: 'POST', body: body() })
    toast.add({
      title: `Imported ${result.imported} ${result.imported === 1 ? 'student' : 'students'}`,
      description: `${result.guardiansCreated} new parent ${result.guardiansCreated === 1 ? 'account' : 'accounts'}, ${result.guardiansLinked} existing linked.`,
      color: 'success',
      icon: 'i-lucide-circle-check',
    })
    await navigateTo('/students')
  }
  catch (e) {
    // Someone changed data since the check: show the new problems
    const errors = (e as { data?: { data?: { errors?: Preview['errors'] } } }).data?.data?.errors
    if (errors) preview.value = { valid: false, rows: preview.value?.rows ?? 0, errors }
    else toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
  finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6">
    <UButton
      to="/students"
      label="All students"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      class="-ms-2.5"
    />
    <h1 class="text-2xl font-semibold">
      Import students
    </h1>

    <UAlert
      v-if="!current?.session"
      color="warning"
      variant="subtle"
      title="Set a current session and term first"
      description="Imported students are enrolled in the current session."
    />

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          1. Fill in the template
        </h2>
      </template>
      <div class="space-y-3 text-sm">
        <p>
          One row per student, up to {{ IMPORT_MAX_ROWS.toLocaleString('en-NG') }} rows{{ current?.session ? `, into ${current.session.name}` : '' }}.
          Required: first and last name, gender (M/F), class (as named in your school, e.g. JSS 1A), guardian name and phone.
          Dates are DD/MM/YYYY. Leave the admission number empty to generate one. Brothers and sisters with the same guardian phone share one parent account.
        </p>
        <p class="text-muted">
          Columns: {{ IMPORT_COLUMNS.join(', ') }}
        </p>
        <UButton
          to="/api/students/import/template"
          external
          download="students-template.csv"
          label="Download template"
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
        />
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          2. Upload and check
        </h2>
      </template>
      <div class="space-y-4">
        <UFileUpload
          v-model="file"
          data-testid="import-file"
          accept=".csv,text/csv"
          label="Choose or drop a CSV file"
          description="Save your spreadsheet as CSV (UTF-8), up to 1 MB"
          :disabled="checking || importing"
          class="w-full"
        />
        <p
          v-if="checking"
          class="text-sm text-muted"
        >
          Checking the file…
        </p>
        <StudentsImportPreview
          v-if="preview"
          :result="preview"
          :importing="importing"
          @import="runImport"
        />
      </div>
    </UCard>
  </div>
</template>
