<script setup lang="ts">
import { TERM_LABELS } from '#shared/constants/academics'

// Every term of every session, newest session first ("First Term 2026/2027"); v-model is the term id.
const termId = defineModel<string | undefined>()
const { data: sessions } = useFetch('/api/sessions', { key: 'sessions', default: () => [] })
const items = computed(() => sessions.value.flatMap(s => s.terms.map(t => ({
  label: `${TERM_LABELS[t.number]} ${s.name}${t.isCurrent ? ' (current)' : ''}`,
  value: t.id,
}))))
</script>

<template>
  <USelect
    v-model="termId"
    data-testid="term-select"
    :items="items"
    placeholder="Current term"
    class="w-full sm:w-64"
  />
</template>
