<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { ROLE_LABELS } from '#shared/constants/roles'
import { StaffDialog, TemporaryPasswordDialog } from '#components'

definePageMeta({ roles: ['admin', 'principal'] })
useHead({ title: 'Staff' })

const toast = useToast()
const confirm = useConfirmDialog()
const overlay = useOverlay()
const staffDialog = overlay.create(StaffDialog, { destroyOnClose: true })
const passwordDialog = overlay.create(TemporaryPasswordDialog, { destroyOnClose: true })

const { user: me } = useUserSession()
const isAdmin = computed(() => me.value?.role === 'admin')

const { data: staff, status, refresh } = await useFetch('/api/staff')
type Staff = NonNullable<typeof staff.value>[number]

const filter = ref<'all' | 'active' | 'inactive'>('all')
const search = ref('')
const filterItems = [
  { label: 'All staff', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
]
const visible = computed(() => (staff.value ?? []).filter(s =>
  (filter.value === 'all' || s.isActive === (filter.value === 'active'))
  && s.name.toLowerCase().includes(search.value.trim().toLowerCase())))

const columns: TableColumn<Staff>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'phone', header: 'Phone' },
  { accessorKey: 'role', header: 'Role' },
  { accessorKey: 'isActive', header: 'Status' },
  { accessorKey: 'lastLoginAt', header: 'Last login' },
  { id: 'actions', meta: { class: { td: 'text-right' } } },
]

// `() => unknown`, not Promise<unknown>: see NameDialogOptions.submit (TS2321)
async function run(action: () => unknown, success: string) {
  try {
    await action()
    await refresh()
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
}

async function addStaff() {
  const result = await staffDialog.open({})
  if (!result || !result.temporaryPassword) return
  await refresh()
  await passwordDialog.open({ name: result.staff.name, password: result.temporaryPassword })
}

async function editStaff(member: Staff) {
  const result = await staffDialog.open({ staff: member, isSelf: member.id === me.value?.id })
  if (result) await refresh()
}

async function resetPassword(member: Staff) {
  const ok = await confirm({
    title: `Reset ${member.name}'s password?`,
    description: 'Their current password stops working. You\'ll get a temporary password to give them.',
    confirmLabel: 'Reset password',
  })
  if (!ok) return
  try {
    const { temporaryPassword } = await $fetch<{ temporaryPassword: string }>(`/api/users/${member.id}/reset-password`, { method: 'POST' })
    await refresh()
    await passwordDialog.open({ name: member.name, password: temporaryPassword })
  }
  catch (e) {
    toast.add({ title: apiErrorMessage(e), color: 'error' })
  }
}

async function setActive(member: Staff, active: boolean) {
  if (!active && !await confirm({
    title: `Deactivate ${member.name}?`,
    description: 'They won\'t be able to log in until you reactivate them. Their class and subject assignments are kept.',
    confirmLabel: 'Deactivate',
  })) return
  await run(() => $fetch(`/api/staff/${member.id}/${active ? 'reactivate' : 'deactivate'}`, { method: 'POST' }),
    `${member.name} ${active ? 'reactivated' : 'deactivated'}`)
}

async function remove(member: Staff) {
  const ok = await confirm({
    title: `Remove ${member.name}?`,
    description: 'For staff who have left. They can\'t log in, disappear from this list, and lose their class and subject assignments. Their records are kept.',
    confirmLabel: 'Remove',
  })
  if (ok) await run(() => $fetch(`/api/staff/${member.id}`, { method: 'DELETE' }), `${member.name} removed`)
}

function actions(member: Staff): DropdownMenuItem[][] {
  const edit = [{ label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => editStaff(member) }]
  if (member.id === me.value?.id) return [edit]
  return [
    [...edit, { label: 'Reset password', icon: 'i-lucide-key-round', onSelect: () => resetPassword(member) }],
    [member.isActive
      ? { label: 'Deactivate', icon: 'i-lucide-user-x', onSelect: () => setActive(member, false) }
      : { label: 'Reactivate', icon: 'i-lucide-user-check', onSelect: () => setActive(member, true) }],
    [{ label: 'Remove', icon: 'i-lucide-trash', color: 'error', onSelect: () => remove(member) }],
  ]
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">
        Staff
      </h1>
      <UButton
        v-if="isAdmin"
        data-testid="add-staff"
        label="Add staff"
        icon="i-lucide-user-plus"
        @click="addStaff"
      />
    </div>

    <div class="flex flex-wrap gap-2">
      <UInput
        v-model="search"
        data-testid="staff-search"
        icon="i-lucide-search"
        placeholder="Search by name"
        class="w-full sm:w-64"
      />
      <USelect
        v-model="filter"
        :items="filterItems"
        class="w-40"
      />
    </div>

    <UTable
      :data="visible"
      :columns="columns"
      :loading="status === 'pending'"
      data-testid="staff-table"
      empty="No staff match."
    >
      <template #name-cell="{ row }">
        <ULink
          :to="`/staff/${row.original.id}`"
          class="font-medium text-highlighted"
        >
          {{ row.original.name }}
        </ULink>
      </template>
      <template #phone-cell="{ row }">
        {{ row.original.phone ?? '' }}
      </template>
      <template #role-cell="{ row }">
        {{ ROLE_LABELS[row.original.role] }}
      </template>
      <template #isActive-cell="{ row }">
        <div class="flex flex-wrap gap-1">
          <UBadge
            :color="row.original.isActive ? 'success' : 'neutral'"
            variant="subtle"
            :label="row.original.isActive ? 'Active' : 'Inactive'"
          />
          <UBadge
            v-if="row.original.mustChangePassword"
            color="warning"
            variant="subtle"
            label="Must change password"
          />
        </div>
      </template>
      <template #lastLoginAt-cell="{ row }">
        {{ formatDateTime(row.original.lastLoginAt) || 'Never' }}
      </template>
      <template #actions-cell="{ row }">
        <UDropdownMenu
          v-if="isAdmin"
          :items="actions(row.original)"
          :content="{ align: 'end' }"
        >
          <UButton
            :data-testid="`staff-actions-${row.original.email}`"
            icon="i-lucide-ellipsis-vertical"
            :aria-label="`Actions for ${row.original.name}`"
            color="neutral"
            variant="ghost"
          />
        </UDropdownMenu>
      </template>
    </UTable>
  </div>
</template>
