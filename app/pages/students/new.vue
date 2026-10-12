<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { admitStudentSchema, PHOTO_MAX_BYTES } from '#shared/schemas/students'
import { TemporaryPasswordDialog } from '#components'
import type { GuardianEntry } from '~/components/students/GuardianPicker.vue'

definePageMeta({ roles: ['admin'] })
useHead({ title: 'Admit student' })

const toast = useToast()
const hydrated = useMounted()
const form = useTemplateRef('form')
const passwordDialog = useOverlay().create(TemporaryPasswordDialog, { destroyOnClose: true })

const { data: current } = await useCurrentTerm()
const { armItems, sectionOfArm } = useClassArms()
const { data: departments } = await useFetch('/api/departments', { default: () => [] })
const departmentItems = computed(() => departments.value.map(d => ({ label: d.name, value: d.id })))

const state = reactive({
  firstName: '',
  middleName: '',
  lastName: '',
  gender: undefined as 'male' | 'female' | undefined,
  dateOfBirth: '',
  stateOfOrigin: undefined as string | undefined,
  lga: '',
  address: '',
  classArmId: undefined as string | undefined,
  departmentId: undefined as string | undefined,
  admissionNumber: '',
  guardians: [] as GuardianEntry[],
})
const isSss = computed(() => !!state.classArmId && sectionOfArm.value.get(state.classArmId) === 'sss')
watch(isSss, (sss) => {
  if (!sss) state.departmentId = undefined
})

const photo = ref<File | null>(null)
const saving = ref(false)

async function uploadPhoto(studentId: string, file: File) {
  try {
    const body = new FormData()
    body.append('photo', file)
    await $fetch(`/api/students/${studentId}/photo`, { method: 'PUT', body })
  }
  catch (e) {
    toast.add({ title: `The student was admitted, but the photo wasn't saved: ${apiFormErrors(e)[0]?.message ?? apiErrorMessage(e)}`, color: 'warning' })
  }
}

async function onSubmit(event: FormSubmitEvent<z.output<typeof admitStudentSchema>>) {
  if (photo.value && photo.value.size > PHOTO_MAX_BYTES) {
    toast.add({ title: 'The photo must be 1 MB or smaller', color: 'error' })
    return
  }
  saving.value = true
  try {
    const { student, newGuardians } = await $fetch('/api/students', { method: 'POST', body: event.data })
    if (photo.value) await uploadPhoto(student.id, photo.value)
    toast.add({ title: `${student.firstName} ${student.lastName} admitted (${student.admissionNumber})`, color: 'success', icon: 'i-lucide-circle-check' })
    for (const guardian of newGuardians) await passwordDialog.open({ name: guardian.name, password: guardian.temporaryPassword })
    await navigateTo(`/students/${student.id}`)
  }
  catch (e) {
    const errors = apiFormErrors(e)
    form.value?.setErrors(errors)
    // Errors with no field on this form (no current session) and conflicts (admission number, phone)
    const session = errors.find(err => err.name === 'sessionId')?.message
    if (!errors.length || session) toast.add({ title: session ?? apiErrorMessage(e), color: 'error' })
  }
  finally {
    saving.value = false
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
      Admit student
    </h1>

    <UAlert
      v-if="!current?.session"
      color="warning"
      variant="subtle"
      title="Set a current session and term first"
      description="Students are admitted into the current session (School setup → Calendar)."
    />

    <UForm
      ref="form"
      method="post"
      :schema="admitStudentSchema"
      :state="state"
      class="space-y-6"
      @submit="onSubmit"
    >
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Student
          </h2>
        </template>
        <StudentsBioFields v-model="state" />
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Class{{ current?.session ? ` · ${current.session.name}` : '' }}
          </h2>
        </template>
        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField
            label="Class"
            name="classArmId"
            required
          >
            <USelectMenu
              v-model="state.classArmId"
              data-testid="student-class"
              :items="armItems"
              value-key="value"
              placeholder="Choose"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="isSss"
            label="Department"
            name="departmentId"
          >
            <USelect
              v-model="state.departmentId"
              :items="departmentItems"
              placeholder="Choose"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Admission number"
            name="admissionNumber"
            help="Leave empty to generate the next one"
          >
            <UInput
              v-model="state.admissionNumber"
              class="w-full"
            />
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Guardians
          </h2>
        </template>
        <UFormField name="guardians">
          <StudentsGuardianPicker v-model="state.guardians" />
        </UFormField>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Photo
          </h2>
        </template>
        <UFileUpload
          v-model="photo"
          accept="image/png,image/jpeg,image/webp"
          label="Choose or drop a photo"
          description="Optional. PNG, JPEG or WebP, up to 1 MB"
          class="w-full sm:w-80"
        />
      </UCard>

      <div class="flex justify-end gap-2">
        <UButton
          to="/students"
          label="Cancel"
          color="neutral"
          variant="ghost"
        />
        <UButton
          data-testid="admit-save"
          type="submit"
          label="Admit student"
          :loading="saving"
          :disabled="!hydrated"
        />
      </div>
    </UForm>
  </div>
</template>
