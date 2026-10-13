<script setup lang="ts">
import type { Role } from '#shared/constants/roles'
import { type ResultAction, type ResultStatus, transitionResults } from '#shared/utils/results'

// The workflow buttons the viewer may use for the current status (same rules as the API).
const props = defineProps<{ status: ResultStatus, role: Role, isClassTeacher: boolean, busy?: boolean }>()
const emit = defineEmits<{ action: [action: ResultAction] }>()

const BUTTONS: { action: ResultAction, label: string, icon: string, color: 'primary' | 'neutral' | 'error' }[] = [
  { action: 'submit', label: 'Submit results', icon: 'i-lucide-send', color: 'primary' },
  { action: 'publish', label: 'Publish', icon: 'i-lucide-megaphone', color: 'primary' },
  { action: 'return', label: 'Return to draft', icon: 'i-lucide-undo-2', color: 'neutral' },
  { action: 'unpublish', label: 'Unpublish', icon: 'i-lucide-eye-off', color: 'error' },
]
const available = computed(() => BUTTONS.filter(b => transitionResults(props.status, b.action, { role: props.role, isClassTeacher: props.isClassTeacher }).ok))
</script>

<template>
  <div
    v-if="available.length"
    class="flex flex-wrap gap-2"
  >
    <UButton
      v-for="button in available"
      :key="button.action"
      :data-testid="`results-${button.action}`"
      :label="button.label"
      :icon="button.icon"
      :color="button.color"
      :variant="button.color === 'primary' ? 'solid' : 'outline'"
      :loading="busy"
      @click="emit('action', button.action)"
    />
  </div>
</template>
