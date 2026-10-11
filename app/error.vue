<script setup lang="ts">
import type { NuxtError } from '#app'
import { TENANT_ERRORS } from '#shared/constants/tenant'

const props = defineProps<{ error: NuxtError }>()

// No school name here: there is no valid tenant when these errors are shown
const status = computed(() => props.error.status ?? props.error.statusCode)
const message = computed(() => props.error.statusText ?? props.error.statusMessage)
const kind = computed(() => {
  if (status.value === TENANT_ERRORS.notFound.statusCode) return 'not-found'
  const { statusCode, statusMessage } = TENANT_ERRORS.suspended
  if (status.value === statusCode && message.value === statusMessage) return 'suspended'
  return 'generic'
})

const titles = { 'not-found': 'School not found', 'suspended': 'School suspended', 'generic': 'Error' }
useHead({ title: () => titles[kind.value] })
</script>

<template>
  <UApp>
    <div class="flex min-h-svh items-center justify-center p-4">
      <div
        v-if="kind === 'not-found'"
        data-testid="error-not-found"
        class="max-w-md text-center"
      >
        <UIcon
          name="i-lucide-search-x"
          class="mx-auto size-10 text-muted"
        />
        <h1 class="mt-4 text-2xl font-semibold">
          School not found
        </h1>
        <p class="mt-2 text-muted">
          There is no school at this address. Check the web address and try again.
        </p>
      </div>

      <div
        v-else-if="kind === 'suspended'"
        data-testid="error-suspended"
        class="max-w-md text-center"
      >
        <UIcon
          name="i-lucide-lock"
          class="mx-auto size-10 text-muted"
        />
        <h1 class="mt-4 text-2xl font-semibold">
          School suspended
        </h1>
        <p class="mt-2 text-muted">
          This school's account is currently suspended. Please contact the school's administration.
        </p>
      </div>

      <div
        v-else
        data-testid="error-generic"
        class="max-w-md text-center"
      >
        <h1 class="text-2xl font-semibold">
          Something went wrong
        </h1>
        <p class="mt-2 text-muted">
          {{ status }} {{ message }}
        </p>
        <UButton
          class="mt-4"
          label="Go home"
          @click="clearError({ redirect: '/' })"
        />
      </div>
    </div>
  </UApp>
</template>
