<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { LOGO_MAX_BYTES, schoolProfileSchema } from '#shared/schemas/school'

definePageMeta({ roles: ['admin'] })
useHead({ title: 'School profile' })

const toast = useToast()
const confirm = useConfirmDialog()
const hydrated = useMounted()
const form = useTemplateRef('form')

const { data: profile, refresh } = await useFetch('/api/school/profile')

const state = reactive({
  name: profile.value?.name ?? '',
  address: profile.value?.address ?? '',
  motto: profile.value?.motto ?? '',
  phone: profile.value?.phone ?? '',
  email: profile.value?.email ?? '',
  admissionPrefix: profile.value?.admissionPrefix ?? '',
})
const saving = ref(false)

async function afterChange(message: string) {
  await Promise.all([refresh(), refreshNuxtData('school')])
  toast.add({ title: message, color: 'success', icon: 'i-lucide-circle-check' })
}

async function onSubmit(event: FormSubmitEvent<z.output<typeof schoolProfileSchema>>) {
  saving.value = true
  try {
    await $fetch('/api/school/profile', { method: 'PATCH', body: event.data })
    await afterChange('School profile saved')
  }
  catch (e) {
    const errors = apiFormErrors(e)
    if (errors.length) form.value?.setErrors(errors)
    else toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function setShowFees(showFeesOnReportCard: boolean) {
  try {
    await $fetch('/api/school/profile', { method: 'PATCH', body: { showFeesOnReportCard } })
    await afterChange(showFeesOnReportCard ? 'Outstanding fees will show on report cards' : 'Fees will be left off report cards')
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
}

async function setShowPositions(showPositions: boolean) {
  try {
    await $fetch('/api/school/profile', { method: 'PATCH', body: { showPositions } })
    await afterChange(showPositions ? 'Positions will show on report cards' : 'Positions will be hidden on report cards')
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
}

// Logo: uploads as soon as a file is chosen
const logoFile = ref<File | null>(null)
const uploading = ref(false)

watch(logoFile, async (file) => {
  if (!file) return
  if (file.size > LOGO_MAX_BYTES) {
    toast.add({ title: 'The logo must be 1 MB or smaller', color: 'error' })
    logoFile.value = null
    return
  }
  uploading.value = true
  try {
    const body = new FormData()
    body.append('logo', file)
    await $fetch('/api/school/logo', { method: 'PUT', body })
    await afterChange('Logo updated')
  }
  catch (e) {
    toast.add({ title: apiFormErrors(e)[0]?.message ?? apiErrorMessage(e), color: 'error' })
  }
  finally {
    uploading.value = false
    logoFile.value = null
  }
})

async function removeLogo() {
  if (!await confirm({ title: 'Remove the logo?', description: 'Report cards and receipts will show the school name only.', confirmLabel: 'Remove' })) return
  await $fetch('/api/school/logo', { method: 'DELETE' })
  await afterChange('Logo removed')
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl space-y-6">
    <h1 class="text-2xl font-semibold">
      School profile
    </h1>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          Details
        </h2>
      </template>
      <UForm
        ref="form"
        method="post"
        :schema="schoolProfileSchema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          label="School name"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            data-testid="profile-name"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Address"
          name="address"
        >
          <UTextarea
            v-model="state.address"
            :rows="2"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Motto"
          name="motto"
        >
          <UInput
            v-model="state.motto"
            class="w-full"
          />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            label="Phone"
            name="phone"
          >
            <UInput
              v-model="state.phone"
              type="tel"
              placeholder="0803 123 4567"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Email"
            name="email"
          >
            <UInput
              v-model="state.email"
              type="email"
              class="w-full"
            />
          </UFormField>
        </div>
        <UFormField
          label="Admission number prefix"
          name="admissionPrefix"
          :help="`New admission numbers look like ${state.admissionPrefix.trim().toUpperCase() || 'GFA'}/${new Date().getFullYear()}/0001`"
        >
          <UInput
            v-model="state.admissionPrefix"
            data-testid="profile-admission-prefix"
            class="w-full sm:w-40"
          />
        </UFormField>
        <UButton
          data-testid="profile-save"
          type="submit"
          label="Save details"
          :loading="saving"
          :disabled="!hydrated"
        />
      </UForm>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          Logo
        </h2>
      </template>
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div class="flex size-24 shrink-0 items-center justify-center rounded-lg border border-default bg-elevated">
          <img
            v-if="profile?.logoUrl"
            :src="profile.logoUrl"
            alt="Current logo"
            class="size-20 object-contain"
          >
          <UIcon
            v-else
            name="i-lucide-image"
            class="size-8 text-muted"
          />
        </div>
        <div class="flex-1 space-y-2">
          <UFileUpload
            v-model="logoFile"
            data-testid="logo-upload"
            accept="image/png,image/jpeg,image/webp"
            label="Choose or drop a logo"
            description="PNG, JPEG or WebP, up to 1 MB"
            :disabled="uploading"
            class="w-full"
          />
          <UButton
            v-if="profile?.logoUrl"
            label="Remove logo"
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash"
            @click="removeLogo"
          />
        </div>
      </div>
    </UCard>

    <UCard>
      <USwitch
        data-testid="show-positions"
        :model-value="profile?.showPositions ?? true"
        label="Show position in class on report cards"
        description="Turn off if your school doesn't rank students."
        @update:model-value="setShowPositions"
      />
      <USwitch
        data-testid="show-fees"
        :model-value="profile?.showFeesOnReportCard ?? false"
        label="Show outstanding fees on report cards"
        description="The balance when results are published. Off by default."
        class="mt-4"
        @update:model-value="setShowFees"
      />
    </UCard>
  </div>
</template>
