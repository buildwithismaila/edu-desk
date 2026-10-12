<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { SECTION_LABELS, SECTIONS, type Section } from '#shared/constants/academics'
import { departmentSchema } from '#shared/schemas/subjects'
import { SettingsSubjectDialog } from '#components'

definePageMeta({ roles: ['admin'] })
useHead({ title: 'Subjects' })

const toast = useToast()
const confirm = useConfirmDialog()
const askName = useNameDialog()
const subjectDialog = useOverlay().create(SettingsSubjectDialog, { destroyOnClose: true })

const section = ref<Section>('primary')
const tabs = SECTIONS.map(s => ({ label: SECTION_LABELS[s], value: s }))

const { data: subjects, refresh } = await useFetch('/api/subjects')
const { data: departments, refresh: refreshDepartments } = await useFetch('/api/departments')
type Subject = NonNullable<typeof subjects.value>[number]
type Department = NonNullable<typeof departments.value>[number]

const sectionSubjects = computed(() => (subjects.value ?? []).filter(s => s.section === section.value))

const columns = computed<TableColumn<Subject>[]>(() => [
  { accessorKey: 'name', header: 'Subject' },
  { accessorKey: 'code', header: 'Code' },
  ...(section.value === 'sss' ? [{ accessorKey: 'departmentName', header: 'Department' }] : []),
  { id: 'actions', meta: { class: { td: 'text-right' } } },
])

// `() => unknown` (not Promise<unknown>): see NameDialogOptions.submit (TS2321)
async function run(action: () => unknown, after: () => unknown = refresh) {
  try {
    await action()
    await after()
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
}

async function openSubject(subject?: Subject) {
  const saved = await subjectDialog.open({ section: section.value, departments: departments.value ?? [], subject })
  if (saved) await refresh()
}

async function deleteSubject(subject: Subject) {
  if (!await confirm({ title: `Delete ${subject.name}?`, confirmLabel: 'Delete' })) return
  await run(() => $fetch(`/api/subjects/${subject.id}`, { method: 'DELETE' }))
}

async function addDepartment() {
  const saved = await askName({
    title: 'New department',
    label: 'Name',
    placeholder: 'Technical',
    schema: departmentSchema.shape.name,
    submit: name => $fetch('/api/departments', { method: 'POST', body: { name } }),
  })
  if (saved) await refreshDepartments()
}

async function renameDepartment(department: Department) {
  const saved = await askName({
    title: 'Rename department',
    label: 'Name',
    value: department.name,
    schema: departmentSchema.shape.name,
    submit: name => $fetch(`/api/departments/${department.id}`, { method: 'PATCH', body: { name } }),
  })
  if (saved) await Promise.all([refreshDepartments(), refresh()])
}

async function deleteDepartment(department: Department) {
  if (!await confirm({ title: `Delete the ${department.name} department?`, confirmLabel: 'Delete' })) return
  await run(() => $fetch(`/api/departments/${department.id}`, { method: 'DELETE' }), refreshDepartments)
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold">
      Subjects
    </h1>

    <UTabs
      v-model="section"
      :items="tabs"
      :content="false"
      class="w-full overflow-x-auto"
    />

    <UCard v-if="section === 'sss'">
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-semibold">
            SSS departments
          </h2>
          <UButton
            data-testid="add-department"
            label="Add department"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            size="sm"
            @click="addDepartment"
          />
        </div>
      </template>
      <ul class="flex flex-wrap gap-2">
        <li
          v-for="department in departments"
          :key="department.id"
          class="flex items-center gap-1 rounded-md border border-default ps-3"
        >
          {{ department.name }}
          <UButton
            icon="i-lucide-pencil"
            :aria-label="`Rename ${department.name}`"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="renameDepartment(department)"
          />
          <UButton
            icon="i-lucide-trash"
            :aria-label="`Delete ${department.name}`"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="deleteDepartment(department)"
          />
        </li>
      </ul>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-semibold">
            {{ SECTION_LABELS[section] }} subjects
          </h2>
          <UButton
            data-testid="add-subject"
            label="Add subject"
            icon="i-lucide-plus"
            size="sm"
            @click="openSubject()"
          />
        </div>
      </template>

      <UTable
        :data="sectionSubjects"
        :columns="columns"
        data-testid="subjects-table"
        empty="No subjects in this section yet."
      >
        <template #departmentName-cell="{ row }">
          {{ row.original.departmentName ?? 'Core' }}
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              icon="i-lucide-pencil"
              :aria-label="`Edit ${row.original.name}`"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="openSubject(row.original)"
            />
            <UButton
              icon="i-lucide-trash"
              :aria-label="`Delete ${row.original.name}`"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="deleteSubject(row.original)"
            />
          </div>
        </template>
      </UTable>
    </UCard>
  </div>
</template>
