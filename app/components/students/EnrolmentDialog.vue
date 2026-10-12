<script setup lang="ts">
// Set or change a student's class arm for the current session. Emits close(true) when saved.
const props = defineProps<{ studentId: string, name: string, classArmId?: string }>()
const emit = defineEmits<{ close: [saved: boolean] }>()

const { armItems } = useClassArms()
const classArmId = ref(props.classArmId)
const error = ref<string>()
const saving = ref(false)

async function save() {
  if (!classArmId.value) {
    error.value = 'Choose a class'
    return
  }
  saving.value = true
  error.value = undefined
  try {
    await $fetch(`/api/students/${props.studentId}/enrolment`, { method: 'PUT', body: { classArmId: classArmId.value } })
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
    :title="`Change ${name}'s class`"
    description="For the current session. Leaving SSS clears the department."
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #body>
      <div class="space-y-3">
        <UFormField
          label="Class"
          :error="error"
        >
          <USelectMenu
            v-model="classArmId"
            data-testid="enrolment-class"
            :items="armItems"
            value-key="value"
            placeholder="Choose"
            class="w-full"
          />
        </UFormField>
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
          data-testid="enrolment-save"
          label="Save"
          :loading="saving"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
