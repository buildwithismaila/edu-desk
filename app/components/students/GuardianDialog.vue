<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { updateGuardianSchema } from '#shared/schemas/students'

// Edit a guardian's name and contact details (also changes them for their other children).
const props = defineProps<{ guardian: { id: string, name: string, phone: string | null, email: string | null } }>()
const emit = defineEmits<{ close: [saved: boolean] }>()

const form = useTemplateRef('form')
const state = reactive({ name: props.guardian.name, phone: props.guardian.phone ?? '', email: props.guardian.email ?? '' })
const error = ref<string>()
const saving = ref(false)

async function onSubmit(event: FormSubmitEvent<z.output<typeof updateGuardianSchema>>) {
  saving.value = true
  error.value = undefined
  try {
    await $fetch(`/api/guardians/${props.guardian.id}`, { method: 'PATCH', body: event.data })
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
    :title="`Edit ${guardian.name}`"
    description="Changes apply to all their children."
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #body>
      <UForm
        id="guardian-form"
        ref="form"
        method="post"
        :schema="updateGuardianSchema"
        :state="state"
        class="space-y-3"
        @submit="onSubmit"
      >
        <UFormField
          label="Full name"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Phone"
          name="phone"
          help="Used to log in"
          required
        >
          <UInput
            v-model="state.phone"
            type="tel"
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
          type="submit"
          form="guardian-form"
          label="Save"
          :loading="saving"
        />
      </div>
    </template>
  </UModal>
</template>
