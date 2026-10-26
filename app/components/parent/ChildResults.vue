<script setup lang="ts">
// A child's published report cards, newest first; each opens the printable card. A term withheld until its
// fees are paid (Phase 10d) shows what's owed and points to the Fees tab instead.
const props = defineProps<{ childId: string }>()
const { data: results } = await useFetch(() => `/api/me/children/${props.childId}/results`, { default: () => [] })
</script>

<template>
  <div class="space-y-2">
    <p
      v-if="!results.length"
      data-testid="child-results-empty"
      class="text-sm text-muted"
    >
      No published report cards yet.
    </p>
    <template
      v-for="card in results"
      :key="card.termId"
    >
      <div
        v-if="card.withheld"
        :data-testid="`child-result-withheld-${card.termId}`"
        class="flex items-center gap-3 rounded-md border border-default p-3"
      >
        <UIcon
          name="i-lucide-lock"
          class="size-5 shrink-0 text-warning"
        />
        <div class="min-w-0 flex-1">
          <p class="font-medium">
            {{ card.term }}
          </p>
          <p class="text-sm text-muted">
            Withheld until fees are paid. Outstanding for this term: {{ formatNaira(card.owedKobo ?? 0) }}.
          </p>
        </div>
        <UButton
          :to="`/my-children/${childId}?tab=fees`"
          label="View fees"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </div>
      <NuxtLink
        v-else
        :to="`/students/${childId}/report-card?term=${card.termId}`"
        :data-testid="`child-result-${card.termId}`"
        class="flex items-center gap-3 rounded-md border border-default p-3 hover:bg-elevated"
      >
        <UIcon
          name="i-lucide-file-text"
          class="size-5 shrink-0 text-primary"
        />
        <div class="min-w-0 flex-1">
          <p class="font-medium">
            {{ card.term }}
          </p>
          <p class="text-sm text-muted">
            Average {{ card.average ?? '—' }}<template v-if="card.position">
              · Position {{ card.position }} of {{ card.numberInClass }}
            </template>
          </p>
        </div>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-5 shrink-0 text-muted"
        />
      </NuxtLink>
    </template>
  </div>
</template>
