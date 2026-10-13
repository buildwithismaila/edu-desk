<script setup lang="ts">
// A parent's own children: a card each, linking to the child's page
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
      <DashboardChildCard
        v-for="child in children"
        :key="child.id"
        :child="child"
      />
    </div>
  </section>
</template>
