<script setup lang="ts">
// A parent's own children with their class this session
const { data: children } = await useFetch('/api/me/children', { default: () => [] })
</script>

<template>
  <section
    data-testid="my-children"
    class="space-y-3"
  >
    <h2 class="text-lg font-semibold">
      My children
    </h2>
    <p
      v-if="!children.length"
      data-testid="my-children-empty"
      class="text-sm text-muted"
    >
      No children are linked to your account yet. Please contact the school.
    </p>
    <div class="grid gap-3 sm:grid-cols-2">
      <UCard
        v-for="child in children"
        :key="child.id"
        :data-testid="`my-child-${child.admissionNumber}`"
      >
        <div class="flex items-center gap-3">
          <UAvatar
            :src="child.photoUrl ?? undefined"
            :alt="child.name"
            size="xl"
          />
          <div class="min-w-0">
            <p class="font-medium">
              {{ child.name }}
            </p>
            <p class="text-sm text-muted">
              {{ child.classLabel ?? 'No class this session' }}
            </p>
            <p class="text-sm text-muted">
              {{ child.admissionNumber }}
            </p>
          </div>
        </div>
      </UCard>
    </div>
  </section>
</template>
