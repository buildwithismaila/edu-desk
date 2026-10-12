<script setup lang="ts">
import { PHOTO_MAX_BYTES } from '#shared/schemas/students'

// Upload, replace or remove a student's photo. Emits close(true) when the photo changed.
const props = defineProps<{ studentId: string, name: string, photoUrl: string | null }>()
const emit = defineEmits<{ close: [changed: boolean] }>()

const file = ref<File | null>(null)
const error = ref<string>()
const busy = ref(false)

async function run(action: () => unknown) {
  busy.value = true
  error.value = undefined
  try {
    await action()
    emit('close', true)
  }
  catch (e) {
    error.value = apiFormErrors(e)[0]?.message ?? apiErrorMessage(e)
  }
  finally {
    busy.value = false
  }
}

function upload() {
  if (!file.value) {
    error.value = 'Choose a photo'
    return
  }
  if (file.value.size > PHOTO_MAX_BYTES) {
    error.value = 'The photo must be 1 MB or smaller'
    return
  }
  const body = new FormData()
  body.append('photo', file.value)
  return run(() => $fetch(`/api/students/${props.studentId}/photo`, { method: 'PUT', body }))
}
</script>

<template>
  <UModal
    :title="`${name}'s photo`"
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #body>
      <div class="space-y-3">
        <UFileUpload
          v-model="file"
          data-testid="photo-upload"
          accept="image/png,image/jpeg,image/webp"
          label="Choose or drop a photo"
          description="PNG, JPEG or WebP, up to 1 MB"
          class="w-full"
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
      <div class="flex w-full flex-wrap justify-between gap-2">
        <UButton
          v-if="photoUrl"
          label="Remove photo"
          color="error"
          variant="ghost"
          :disabled="busy"
          @click="run(() => $fetch(`/api/students/${studentId}/photo`, { method: 'DELETE' }))"
        />
        <div class="ms-auto flex gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="emit('close', false)"
          />
          <UButton
            data-testid="photo-save"
            label="Upload"
            :loading="busy"
            @click="upload"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
