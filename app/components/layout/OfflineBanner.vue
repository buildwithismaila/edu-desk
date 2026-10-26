<script setup lang="ts">
const online = useOnline()
</script>

<template>
  <div
    v-if="!online"
    data-testid="offline-banner"
    role="status"
    class="flex items-center gap-2 bg-warning/10 px-4 py-2 text-sm text-warning"
  >
    <UIcon
      name="i-lucide-wifi-off"
      class="size-4 shrink-0"
    />
    You're offline. Registers you take are saved on this phone and sent when you're back online.
  </div>
</template>
