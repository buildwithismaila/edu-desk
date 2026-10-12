<script setup lang="ts">
import { z } from 'zod'

// Opened through useNameDialog(): asks for one name, calls `submit` and shows its API errors.
// Emits close(true) once `submit` succeeds.
const props = defineProps<{
  title: string
  label: string
  value?: string
  placeholder?: string
  /** Validation for the name (shared schema, e.g. sessionNameSchema). */
  schema: z.ZodType<string>
  submit: (name: string) => unknown
}>()

const emit = defineEmits<{ close: [saved: boolean] }>()

const formSchema = computed(() => z.object({ name: props.schema }))
const state = reactive({ name: props.value ?? '' })
const error = ref<string>()
const saving = ref(false)

async function onSubmit() {
  saving.value = true
  error.value = undefined
  try {
    await props.submit(formSchema.value.parse(state).name)
    emit('close', true)
  }
  catch (e) {
    error.value = apiFormErrors(e)[0]?.message ?? apiErrorMessage(e)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :title="title"
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #body>
      <UForm
        id="name-dialog-form"
        method="post"
        :schema="formSchema"
        :state="state"
        class="space-y-3"
        @submit="onSubmit"
      >
        <UFormField
          :label="label"
          name="name"
        >
          <UInput
            v-model="state.name"
            data-testid="name-dialog-input"
            :placeholder="placeholder"
            autofocus
            class="w-full"
          />
        </UFormField>
        <UAlert
          v-if="error"
          data-testid="name-dialog-error"
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
          data-testid="name-dialog-save"
          type="submit"
          form="name-dialog-form"
          label="Save"
          :loading="saving"
        />
      </div>
    </template>
  </UModal>
</template>
