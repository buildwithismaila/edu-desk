<script setup lang="ts">
// Shows a one-time temporary password (new staff, admin reset). Opened through useOverlay.
defineProps<{ name: string, password: string }>()
const emit = defineEmits<{ close: [] }>()

const { copy, copied } = useClipboard()
</script>

<template>
  <UModal
    title="Temporary password"
    :dismissible="false"
    @update:open="(open) => !open && emit('close')"
  >
    <template #body>
      <div class="space-y-3">
        <p class="text-sm">
          Give this password to <span class="font-medium">{{ name }}</span>. They'll choose a new one when they log in. It won't be shown again.
        </p>
        <div class="flex items-center gap-2">
          <code
            data-testid="temp-password"
            class="flex-1 rounded-md bg-elevated px-3 py-2 font-mono text-lg tracking-wider"
          >{{ password }}</code>
          <UButton
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            :label="copied ? 'Copied' : 'Copy'"
            color="neutral"
            variant="outline"
            @click="copy(password)"
          />
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end">
        <UButton
          data-testid="temp-password-done"
          label="Done"
          @click="emit('close')"
        />
      </div>
    </template>
  </UModal>
</template>
