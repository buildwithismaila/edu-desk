<script setup lang="ts">
import { studentGuardianSchema } from '#shared/schemas/students'
import type { GuardianEntry } from './GuardianPicker.vue'

// Link an existing guardian to a student or create a new one. Emits close with the new guardian's
// temporary password (only for a new account), or false when cancelled.
const props = defineProps<{ studentId: string, name: string }>()
const emit = defineEmits<{ close: [result: false | { name: string, temporaryPassword: string | null }] }>()

const picked = ref<GuardianEntry[]>([])
const error = ref<string>()
const saving = ref(false)

async function save() {
  const entry = picked.value[0]
  if (!entry) {
    error.value = 'Choose or add a guardian'
    return
  }
  saving.value = true
  error.value = undefined
  try {
    const { guardian, temporaryPassword } = await $fetch(`/api/students/${props.studentId}/guardians`, { method: 'POST', body: studentGuardianSchema.parse(entry) })
    emit('close', { name: guardian.name, temporaryPassword })
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
    :title="`Add a guardian for ${name}`"
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #body>
      <div class="space-y-3">
        <StudentsGuardianPicker
          v-model="picked"
          :max="1"
        />
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :title="error"
        />
      </div>
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
          data-testid="add-guardian-save"
          label="Add guardian"
          :loading="saving"
          :disabled="!picked.length"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
