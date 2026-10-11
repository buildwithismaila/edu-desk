<template>
  <div class="min-h-svh bg-white text-black">
    <slot />
  </div>
</template>

<style>
@page {
  size: A4;
  margin: 12mm;
}

@media print {
  .no-print {
    display: none !important;
  }
}
</style>
