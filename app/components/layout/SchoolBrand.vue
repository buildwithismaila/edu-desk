<script setup lang="ts">
defineProps<{ collapsed?: boolean }>()

const { data: school } = await useSchool()
</script>

<template>
  <NuxtLink
    to="/"
    class="flex min-w-0 items-center gap-2 font-semibold"
  >
    <UIcon
      name="i-lucide-school"
      class="size-5 shrink-0 text-primary"
    />
    <span
      v-if="!collapsed"
      data-testid="school-name"
      class="truncate"
    >{{ school?.name }}</span>
  </NuxtLink>
</template>
