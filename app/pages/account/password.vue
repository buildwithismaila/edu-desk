<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { type ChangePasswordInput, changePasswordSchema, PASSWORD_MIN_LENGTH } from '#shared/schemas/auth'

useHead({ title: 'Change password' })

const { user, fetch: refreshSession } = useUserSession()
const toast = useToast()
const form = useTemplateRef('form')

const state = reactive<ChangePasswordInput>({ currentPassword: '', newPassword: '', confirmPassword: '' })
const hydrated = useMounted()
const error = ref<string>()
const loading = ref(false)

async function onSubmit(event: FormSubmitEvent<z.output<typeof changePasswordSchema>>) {
  loading.value = true
  error.value = undefined
  try {
    await $fetch('/api/auth/password', { method: 'POST', body: event.data })
    await refreshSession()
    toast.add({ title: 'Password changed', color: 'success', icon: 'i-lucide-circle-check' })
    await navigateTo('/')
  }
  catch (e) {
    const fieldErrors = apiFormErrors(e)
    if (fieldErrors.length) form.value?.setErrors(fieldErrors)
    else error.value = apiErrorMessage(e)
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-md space-y-6">
    <h1 class="text-2xl font-semibold">
      Change password
    </h1>

    <UAlert
      v-if="user?.mustChangePassword"
      data-testid="must-change-password"
      color="warning"
      variant="subtle"
      icon="i-lucide-key-round"
      title="Choose a new password"
      description="Your password was reset by your school admin. Choose a new one to continue."
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="error"
    />

    <UForm
      ref="form"
      method="post"
      :schema="changePasswordSchema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField
        label="Current password"
        name="currentPassword"
      >
        <UInput
          v-model="state.currentPassword"
          data-testid="current-password"
          type="password"
          autocomplete="current-password"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="New password"
        name="newPassword"
        :hint="`At least ${PASSWORD_MIN_LENGTH} characters`"
      >
        <UInput
          v-model="state.newPassword"
          data-testid="new-password"
          type="password"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Confirm new password"
        name="confirmPassword"
      >
        <UInput
          v-model="state.confirmPassword"
          data-testid="confirm-password"
          type="password"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>

      <UButton
        data-testid="change-password-submit"
        type="submit"
        label="Change password"
        :loading="loading"
        :disabled="!hydrated"
      />
    </UForm>
  </div>
</template>
