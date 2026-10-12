<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { type LoginInput, loginSchema } from '#shared/schemas/auth'

definePageMeta({ layout: 'auth', public: true })

const { data: school } = await useSchool()
useHead({ title: () => `Log in · ${school.value?.name ?? ''}` })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()

const state = reactive<LoginInput>({ email: '', password: '' })
// Submitting before hydration would be a native form submit; keep the button off until the app runs
const hydrated = useMounted()
const error = ref<string>()
const loading = ref(false)

async function onSubmit(event: FormSubmitEvent<z.output<typeof loginSchema>>) {
  loading.value = true
  error.value = undefined
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: event.data })
    await refreshSession()
    await navigateTo(safeRedirect(route.query.redirect))
  }
  catch (e) {
    error.value = apiErrorMessage(e)
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1 text-center">
      <img
        v-if="school?.logoUrl"
        :src="school.logoUrl"
        alt=""
        class="mx-auto size-14 rounded object-contain"
      >
      <UIcon
        v-else
        name="i-lucide-school"
        class="mx-auto size-8 text-primary"
      />
      <h1
        data-testid="login-school-name"
        class="text-xl font-semibold"
      >
        {{ school?.name }}
      </h1>
      <p class="text-sm text-muted">
        Log in to continue
      </p>
    </div>

    <UAlert
      v-if="error"
      data-testid="login-error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="error"
    />

    <!-- method="post": an early native submit must never put the password in the URL -->
    <UForm
      method="post"
      :schema="loginSchema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField
        label="Email"
        name="email"
      >
        <UInput
          v-model="state.email"
          data-testid="login-email"
          type="email"
          autocomplete="username"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Password"
        name="password"
      >
        <UInput
          v-model="state.password"
          data-testid="login-password"
          type="password"
          autocomplete="current-password"
          class="w-full"
        />
      </UFormField>

      <UButton
        data-testid="login-submit"
        type="submit"
        label="Log in"
        block
        :loading="loading"
        :disabled="!hydrated"
      />
    </UForm>

    <p class="text-center text-xs text-muted">
      Forgot your password? Ask your school admin to reset it.
    </p>
  </div>
</template>
