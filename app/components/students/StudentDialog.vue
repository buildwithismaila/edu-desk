<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { updateStudentSchema } from '#shared/schemas/students'

type Student = {
  id: string
  firstName: string
  middleName: string | null
  lastName: string
  gender: 'male' | 'female'
  dateOfBirth?: string | null
  stateOfOrigin?: string | null
  lga?: string | null
  address?: string | null
  departmentId: string | null
  enrolment: { section: string } | null
}

// Edit a student's bio and department. Emits close(true) when saved, false when cancelled.
const props = defineProps<{ student: Student }>()
const emit = defineEmits<{ close: [saved: boolean] }>()

const form = useTemplateRef('form')
const state = reactive({
  firstName: props.student.firstName,
  middleName: props.student.middleName ?? '',
  lastName: props.student.lastName,
  gender: props.student.gender as 'male' | 'female' | undefined,
  dateOfBirth: props.student.dateOfBirth ?? '',
  stateOfOrigin: props.student.stateOfOrigin ?? undefined,
  lga: props.student.lga ?? '',
  address: props.student.address ?? '',
  departmentId: props.student.departmentId ?? undefined,
})
const isSss = props.student.enrolment?.section === 'sss'
const { data: departments } = useFetch('/api/departments', { default: () => [], immediate: isSss })
const departmentItems = computed(() => [{ label: 'None', value: 'none' }, ...departments.value.map(d => ({ label: d.name, value: d.id }))])
const department = computed({
  get: () => state.departmentId ?? 'none',
  set: (value) => {
    state.departmentId = value === 'none' ? undefined : value
  },
})
const error = ref<string>()
const saving = ref(false)

async function onSubmit(event: FormSubmitEvent<z.output<typeof updateStudentSchema>>) {
  saving.value = true
  error.value = undefined
  try {
    await $fetch(`/api/students/${props.student.id}`, { method: 'PATCH', body: { ...event.data, departmentId: isSss ? state.departmentId ?? null : undefined } })
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
    title="Edit student"
    :ui="{ content: 'sm:max-w-2xl' }"
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #body>
      <UForm
        id="student-form"
        ref="form"
        method="post"
        :schema="updateStudentSchema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <StudentsBioFields v-model="state" />
        <UFormField
          v-if="isSss"
          label="Department"
          name="departmentId"
        >
          <USelect
            v-model="department"
            :items="departmentItems"
            class="w-full sm:w-60"
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
          data-testid="student-save"
          type="submit"
          form="student-form"
          label="Save"
          :loading="saving"
        />
      </div>
    </template>
  </UModal>
</template>
