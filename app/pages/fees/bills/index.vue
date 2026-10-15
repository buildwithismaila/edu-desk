<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { InternalApi } from 'nitropack/types'

definePageMeta({ roles: ['admin', 'bursar', 'principal'] })
useHead({ title: 'Bills' })

type Bills = InternalApi['/api/fees/bills']['get']
type Row = Bills['items'][number]

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirmDialog()
const { user } = useUserSession()
const canEdit = computed(() => user.value?.role === 'admin' || user.value?.role === 'bursar')

// Term, arm, search and page live in the URL
const text = (v: unknown) => typeof v === 'string' && v ? v : undefined
const query = computed(() => ({
  termId: text(route.query.term),
  classArmId: text(route.query.arm),
  search: text(route.query.search),
  page: Math.max(1, Number(route.query.page) || 1),
}))
function setQuery(changes: Record<string, string | number | undefined>) {
  const next: Record<string, unknown> = { term: query.value.termId, arm: query.value.classArmId, search: query.value.search, page: undefined, ...changes }
  router.replace({ query: Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === 'page' && v === 1))) as Record<string, string> })
}
const termId = computed({ get: () => query.value.termId, set: v => setQuery({ term: v }) })
const { armItems } = useClassArms()
const armFilter = computed({ get: () => query.value.classArmId ?? 'all', set: v => setQuery({ arm: v === 'all' ? undefined : v }) })
const search = ref(query.value.search ?? '')
watchDebounced(search, v => setQuery({ search: v.trim() || undefined }), { debounce: 300 })

const requestFetch = useRequestFetch()
const { data, refresh, status } = await useAsyncData('bills', () => requestFetch<Bills>('/api/fees/bills', {
  query: Object.fromEntries(Object.entries(query.value).filter(([, v]) => v !== undefined)),
}), { watch: [query] })

const columns: TableColumn<Row>[] = [
  { accessorKey: 'name', header: 'Student' },
  { accessorKey: 'classLabel', header: 'Class' },
  { accessorKey: 'billed', header: 'Billed', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { accessorKey: 'paid', header: 'Paid', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { accessorKey: 'balance', header: 'Balance', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
]

const busy = ref(false)
async function act(action: 'generate' | 'refresh') {
  if (!data.value) return
  const scope = query.value.classArmId ? armItems.value.find(a => a.value === query.value.classArmId)?.label ?? 'this class' : 'the whole school'
  const ok = await confirm(action === 'generate'
    ? { title: `Generate bills for ${scope}?`, description: `Creates ${data.value.term.label} bills for students who don't have one yet, with last term's balance carried forward. Existing bills aren't changed.`, confirmLabel: 'Generate bills' }
    : { title: `Refresh bills for ${scope}?`, description: 'Updates bills that have no payments to match the current fee items, and re-syncs every bill\'s carried-forward balance.', confirmLabel: 'Refresh bills' })
  if (!ok) return
  busy.value = true
  try {
    const body = { termId: data.value.term.id, ...(query.value.classArmId ? { classArmId: query.value.classArmId } : {}) }
    const result = await $fetch<{ created?: number, existing?: number, refreshed?: number, kept?: number }>(`/api/fees/bills/${action}`, { method: 'POST', body })
    await refresh()
    toast.add({
      title: action === 'generate' ? `${result.created} new ${result.created === 1 ? 'bill' : 'bills'} (${result.existing} already billed)` : `${result.refreshed} refreshed, ${result.kept} with payments kept`,
      color: 'success',
      icon: 'i-lucide-circle-check',
    })
  }
  catch (e) {
    toast.add({ title: apiFormErrors(e)[0]?.message ?? apiErrorMessage(e), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">
        Bills{{ data ? ` · ${data.term.label}` : '' }}
      </h1>
      <div
        v-if="canEdit"
        class="flex flex-wrap gap-2"
      >
        <UButton
          data-testid="bills-generate"
          label="Generate bills"
          icon="i-lucide-file-plus"
          :loading="busy"
          @click="act('generate')"
        />
        <UButton
          label="Refresh bills"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          :loading="busy"
          @click="act('refresh')"
        />
      </div>
    </div>

    <div class="grid gap-2 sm:flex sm:flex-wrap">
      <FeesTermSelect v-model="termId" />
      <UButton
        v-if="query.classArmId"
        data-testid="class-invoices-link"
        :to="{ path: '/fees/invoices', query: { arm: query.classArmId, term: query.termId } }"
        label="Print class invoices"
        icon="i-lucide-printer"
        color="neutral"
        variant="outline"
      />
      <USelect
        v-model="armFilter"
        data-testid="bills-arm"
        :items="[{ label: 'All classes', value: 'all' }, ...armItems]"
        class="w-full sm:w-48"
      />
      <UInput
        v-model="search"
        data-testid="bills-search"
        icon="i-lucide-search"
        placeholder="Search by name or admission no."
        class="w-full sm:w-72"
      />
    </div>

    <UTable
      data-testid="bills-table"
      :data="data?.items ?? []"
      :columns="columns"
      :loading="status === 'pending'"
      empty="No bills yet. Generate bills for the term."
    >
      <template #name-cell="{ row }">
        <ULink
          :to="`/students/${row.original.studentId}/fees${query.termId ? `?term=${query.termId}` : ''}`"
          class="font-medium text-highlighted"
        >
          {{ row.original.name }}
        </ULink>
        <span class="block text-xs text-muted">{{ row.original.admissionNumber }}</span>
      </template>
      <template #billed-cell="{ row }">
        {{ formatNaira(row.original.billed - row.original.discount) }}
      </template>
      <template #paid-cell="{ row }">
        {{ formatNaira(row.original.paid) }}
      </template>
      <template #balance-cell="{ row }">
        <span :class="row.original.balance > 0 ? 'font-medium text-error' : row.original.balance < 0 ? 'text-success' : 'text-muted'">
          {{ row.original.balance === 0 ? 'Paid' : formatNaira(row.original.balance) }}
        </span>
      </template>
    </UTable>

    <div
      v-if="data && data.total > data.pageSize"
      class="flex justify-center"
    >
      <UPagination
        :page="query.page"
        :total="data.total"
        :items-per-page="data.pageSize"
        @update:page="page => setQuery({ page })"
      />
    </div>
  </div>
</template>
