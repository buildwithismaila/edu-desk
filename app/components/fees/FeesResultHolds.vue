<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'

type Holds = InternalApi['/api/students/:id/result-holds']['get']

// Results this student's parents can't see because fees are owed (Phase 10d), with release / withhold again.
// `revision` changes whenever the page's fees reload (a payment or reversal), so this follows at once.
const props = defineProps<{ studentId: string, revision?: unknown }>()
const toast = useToast()

const requestFetch = useRequestFetch()
const { data: holds, refresh } = await useAsyncData(`result-holds-${props.studentId}`,
  () => requestFetch<Holds>(`/api/students/${props.studentId}/result-holds`))
watch(() => props.revision, () => refresh())

const busy = ref<string>()
async function setReleased(termId: string, released: boolean) {
  busy.value = termId
  try {
    await $fetch(`/api/students/${props.studentId}/result-release`, { method: released ? 'PUT' : 'DELETE', query: { termId } })
    await refresh()
    toast.add({ title: released ? 'Result released to the parents' : 'Result withheld again until fees are paid', color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
  finally {
    busy.value = undefined
  }
}
</script>

<template>
  <UAlert
    v-if="holds?.enabled && holds.terms.length"
    data-testid="result-holds"
    color="warning"
    variant="subtle"
    icon="i-lucide-lock"
    title="Results withheld from parents until fees are paid"
  >
    <template #description>
      <ul class="mt-1 space-y-2">
        <li
          v-for="hold in holds.terms"
          :key="hold.termId"
          :data-testid="`result-hold-${hold.termId}`"
          class="flex flex-wrap items-center justify-between gap-2"
        >
          <span>
            {{ hold.term }} · owing {{ formatNaira(hold.owedKobo) }}
            <template v-if="hold.released">· released by {{ hold.released.by ?? 'a former user' }}</template>
          </span>
          <UButton
            :data-testid="`result-hold-toggle-${hold.termId}`"
            :label="hold.released ? 'Withhold again' : 'Release result'"
            color="neutral"
            variant="outline"
            size="xs"
            :loading="busy === hold.termId"
            @click="setReleased(hold.termId, !hold.released)"
          />
        </li>
      </ul>
    </template>
  </UAlert>
</template>
