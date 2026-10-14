<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'
import { PARENT_LOGIN_STATUS_LABELS, PARENT_LOGIN_STATUSES, type ParentLoginStatus } from '#shared/utils/parent-logins'

// Admin: give parents logins in bulk, printed on slips (docs/features/10a-pilot-readiness.md)
definePageMeta({ roles: ['admin'] })
useHead({ title: 'Parent logins' })

type Generated = InternalApi['/api/parent-logins']['post']

const toast = useToast()
const confirm = useConfirmDialog()
const { armItems } = useClassArms()
const slips = useState<Generated | null>('parent-login-slips', () => null)

const classArmId = ref<string>()
const status = ref<ParentLoginStatus>()
const search = ref('')
const page = ref(1)
const query = computed(() => ({
  classArmId: classArmId.value,
  status: status.value,
  search: search.value.trim() || undefined,
  page: page.value,
}))
watch([classArmId, status, search], () => {
  page.value = 1
})
const { data, refresh } = await useFetch('/api/parent-logins', { query, watch: [query] })

const selected = ref<string[]>([])
const toggle = (id: string) => {
  selected.value = selected.value.includes(id) ? selected.value.filter(s => s !== id) : [...selected.value, id]
}
const statusItems = PARENT_LOGIN_STATUSES.map(value => ({ label: PARENT_LOGIN_STATUS_LABELS[value], value }))
const BADGE = { none: 'neutral', issued: 'warning', active: 'success' } as const
const armLabel = computed(() => armItems.value.find(a => a.value === classArmId.value)?.label)

const busy = ref(false)
async function generate(body: { all?: true, classArmId?: string, guardianIds?: string[], includeActive?: boolean }, title: string, description: string) {
  if (!await confirm({ title, description, confirmLabel: 'Generate logins' })) return
  busy.value = true
  try {
    const result = await $fetch<Generated>('/api/parent-logins', { method: 'POST', body })
    if (!result.slips.length) {
      toast.add({ title: 'Nobody needed a login', description: result.skipped ? `${result.skipped} active parent(s) skipped` : undefined, color: 'neutral' })
      return
    }
    slips.value = result
    selected.value = []
    await refresh()
    await navigateTo('/parent-logins/slips')
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

const generateAll = () => generate({ all: true }, 'Generate logins for every parent without one?',
  'Each gets a one-time password on a printable slip. Parents who already have a slip or their own password are left alone.')
const generateClass = () => generate({ classArmId: classArmId.value }, `Generate logins for ${armLabel.value} parents without one?`,
  'Each gets a one-time password on a printable slip. Parents who already have a slip or their own password are left alone.')
function generateSelected() {
  const chosen = data.value?.items.filter(p => selected.value.includes(p.id)) ?? []
  const active = chosen.filter(p => p.status === 'active').length
  return generate({ guardianIds: selected.value, includeActive: active > 0 || undefined }, `Generate new logins for ${chosen.length} parent(s)?`,
    `Any slip they already have stops working${active ? `, and ${active} active parent(s) will have to use the new password instead of their own` : ''}.`)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-semibold">
          Parent logins
        </h1>
        <p class="text-sm text-muted">
          Give parents a one-time password on a printed slip. They set their own password at first login.
        </p>
      </div>
      <UButton
        data-testid="generate-all"
        label="Logins for all without one"
        icon="i-lucide-key-round"
        :loading="busy"
        @click="generateAll"
      />
    </div>

    <div class="flex flex-wrap gap-2">
      <USelect
        v-model="classArmId"
        data-testid="filter-class"
        :items="armItems"
        placeholder="All classes"
        class="w-full sm:w-48"
      />
      <USelect
        v-model="status"
        data-testid="filter-status"
        :items="statusItems"
        placeholder="Any status"
        class="w-full sm:w-56"
      />
      <UInput
        v-model="search"
        data-testid="filter-search"
        icon="i-lucide-search"
        placeholder="Name, phone or email"
        class="w-full sm:w-64"
      />
      <UButton
        v-if="classArmId || status || search"
        label="Clear"
        color="neutral"
        variant="ghost"
        @click="classArmId = undefined; status = undefined; search = ''"
      />
    </div>

    <div
      v-if="selected.length || classArmId"
      class="flex flex-wrap items-center gap-2"
    >
      <UButton
        v-if="classArmId"
        data-testid="generate-class"
        :label="`Logins for ${armLabel} without one`"
        color="neutral"
        variant="outline"
        :loading="busy"
        @click="generateClass"
      />
      <UButton
        v-if="selected.length"
        data-testid="generate-selected"
        :label="`New logins for ${selected.length} selected`"
        color="neutral"
        variant="outline"
        :loading="busy"
        @click="generateSelected"
      />
    </div>

    <p
      v-if="data && !data.items.length"
      data-testid="parent-logins-empty"
      class="text-sm text-muted"
    >
      No parents match.
    </p>
    <ul
      v-else
      data-testid="parent-logins-list"
      class="divide-y divide-default rounded-md border border-default"
    >
      <li
        v-for="parent in data?.items"
        :key="parent.id"
        :data-testid="`parent-${parent.phone}`"
        class="flex flex-wrap items-center gap-3 p-3"
      >
        <UCheckbox
          :model-value="selected.includes(parent.id)"
          :aria-label="`Select ${parent.name}`"
          @update:model-value="toggle(parent.id)"
        />
        <div class="min-w-0 flex-1 basis-48">
          <p class="font-medium">
            {{ parent.name }}
          </p>
          <p class="text-sm text-muted">
            {{ parent.phone }}{{ parent.email ? ` · ${parent.email}` : '' }}
          </p>
        </div>
        <p class="min-w-0 flex-1 basis-48 text-sm">
          {{ parent.children.map(c => `${c.name}${c.classLabel ? ` (${c.classLabel})` : ''}`).join(', ') || 'No current children' }}
        </p>
        <div class="flex flex-col items-end gap-1">
          <UBadge
            :label="PARENT_LOGIN_STATUS_LABELS[parent.status]"
            :color="BADGE[parent.status]"
            variant="subtle"
            data-testid="parent-login-status"
          />
          <span
            v-if="parent.lastLoginAt"
            class="text-xs text-muted"
          >Last login {{ formatDateTime(parent.lastLoginAt) }}</span>
        </div>
      </li>
    </ul>
    <UPagination
      v-if="data && data.total > data.pageSize"
      v-model:page="page"
      :total="data.total"
      :items-per-page="data.pageSize"
    />
  </div>
</template>
