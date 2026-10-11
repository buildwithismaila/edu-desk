<script setup lang="ts">
const { data: school } = await useSchool()
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">
      Welcome to {{ school?.name }}
    </h1>
  </div>
</template>
