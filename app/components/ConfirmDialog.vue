<script setup lang="ts">
// Opened through useConfirmDialog(); emits close(true) when confirmed
defineProps<{
  title: string
  description?: string
  confirmLabel?: string
}>()

const emit = defineEmits<{ close: [confirmed: boolean] }>()
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :ui="{ footer: 'justify-end' }"
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        @click="emit('close', false)"
      />
      <UButton
        data-testid="confirm-dialog-confirm"
        :label="confirmLabel ?? 'Confirm'"
        color="error"
        @click="emit('close', true)"
      />
    </template>
  </UModal>
</template>
