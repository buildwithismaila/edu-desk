<script setup lang="ts">
import { SECTION_LABELS, type Section } from '#shared/constants/academics'
import { subjectSchema } from '#shared/schemas/subjects'

const props = defineProps<{
  section: Section
  departments: { id: string, name: string }[]
  /** Editing an existing subject; omit to add one. */
  subject?: { id: string, name: string, code: string | null, departmentId: string | null }
}>()

const emit = defineEmits<{ close: [saved: boolean] }>()

const CORE = 'core'
const form = useTemplateRef('form')
const state = reactive({
  section: props.section,
  name: props.subject?.name ?? '',
  code: props.subject?.code ?? '',
  departmentId: props.subject?.departmentId ?? null as string | null,
})
// USelect can't hold null, so "Core" is a sentinel value
const department = computed({
  get: () => state.departmentId ?? CORE,
  set: (value: string) => {
    state.departmentId = value === CORE ? null : value
  },
})
const departmentItems = computed(() => [
  { label: 'Core (all departments)', value: CORE },
  ...props.departments.map(d => ({ label: d.name, value: d.id })),
])

const error = ref<string>()
const saving = ref(false)

async function onSubmit() {
  saving.value = true
  error.value = undefined
  try {
    const body = subjectSchema.parse(state)
    if (props.subject) await $fetch(`/api/subjects/${props.subject.id}`, { method: 'PATCH', body })
    else await $fetch('/api/subjects', { method: 'POST', body })
    emit('close', true)
  }
  catch (e) {
    const errors = apiFormErrors(e)
    if (errors.length) form.value?.setErrors(errors)
    else error.value = apiErrorMessage(e)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :title="subject ? `Edit ${subject.name}` : `New ${SECTION_LABELS[section]} subject`"
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #body>
      <UForm
        id="subject-form"
        ref="form"
        method="post"
        :schema="subjectSchema"
        :state="state"
        class="space-y-3"
        @submit="onSubmit"
      >
        <UFormField
          label="Name"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            data-testid="subject-name"
            autofocus
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Code"
          name="code"
          hint="Optional, e.g. MTH"
        >
          <UInput
            v-model="state.code"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="section === 'sss'"
          label="Department"
          name="departmentId"
        >
          <USelect
            v-model="department"
            data-testid="subject-department"
            :items="departmentItems"
            class="w-full"
          />
        </UFormField>
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :title="error"
        />
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="emit('close', false)"
        />
        <UButton
          data-testid="subject-save"
          type="submit"
          form="subject-form"
          label="Save"
          :loading="saving"
        />
      </div>
    </template>
  </UModal>
</template>
