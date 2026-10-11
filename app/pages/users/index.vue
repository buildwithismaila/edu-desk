<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { ROLE_LABELS } from '#shared/constants/roles'

definePageMeta({ roles: ['admin'] })
useHead({ title: 'Users' })

const { user: currentUser } = useUserSession()
const { data, status, refresh } = await useFetch('/api/users')

type UserRow = NonNullable<typeof data.value>['users'][number]

const columns: TableColumn<UserRow>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'role', header: 'Role' },
  { accessorKey: 'isActive', header: 'Status' },
  { accessorKey: 'lastLoginAt', header: 'Last login' },
  { id: 'actions', meta: { class: { td: 'text-right' } } },
]

// Reset flow: confirm → call the API → show the temporary password once
const target = ref<UserRow>()
const temporaryPassword = ref<string>()
const resetting = ref(false)
const resetError = ref<string>()
const modalOpen = computed({
  get: () => !!target.value,
  set: (open) => {
    if (!open) closeModal()
  },
})

function askReset(row: UserRow) {
  target.value = row
  temporaryPassword.value = undefined
  resetError.value = undefined
}

function closeModal() {
  target.value = undefined
  temporaryPassword.value = undefined
}

async function confirmReset() {
  if (!target.value) return
  resetting.value = true
  resetError.value = undefined
  try {
    const res = await $fetch(`/api/users/${target.value.id}/reset-password`, { method: 'POST' })
    temporaryPassword.value = res.temporaryPassword
    await refresh()
  }
  catch (e) {
    resetError.value = apiErrorMessage(e)
  }
  finally {
    resetting.value = false
  }
}

const { copy, copied } = useClipboard()
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-semibold">
      Users
    </h1>

    <UTable
      :data="data?.users ?? []"
      :columns="columns"
      :loading="status === 'pending'"
      data-testid="users-table"
    >
      <template #role-cell="{ row }">
        {{ ROLE_LABELS[row.original.role] }}
      </template>

      <template #isActive-cell="{ row }">
        <UBadge
          :color="row.original.isActive ? 'success' : 'neutral'"
          variant="subtle"
          :label="row.original.isActive ? 'Active' : 'Disabled'"
        />
        <UBadge
          v-if="row.original.mustChangePassword"
          class="ms-1"
          color="warning"
          variant="subtle"
          label="Must change password"
        />
      </template>

      <template #lastLoginAt-cell="{ row }">
        {{ formatDateTime(row.original.lastLoginAt) || 'Never' }}
      </template>

      <template #actions-cell="{ row }">
        <UButton
          v-if="row.original.id !== currentUser?.id"
          :data-testid="`reset-password-${row.original.email}`"
          label="Reset password"
          icon="i-lucide-key-round"
          color="neutral"
          variant="outline"
          size="sm"
          @click="askReset(row.original)"
        />
      </template>
    </UTable>

    <UModal
      v-model:open="modalOpen"
      :title="temporaryPassword ? 'Temporary password' : 'Reset password?'"
      :dismissible="!resetting"
    >
      <template #body>
        <div
          v-if="temporaryPassword"
          class="space-y-3"
        >
          <p class="text-sm">
            Give this password to <span class="font-medium">{{ target?.name }}</span>. They'll choose a new one when they log in. It won't be shown again.
          </p>
          <div class="flex items-center gap-2">
            <code
              data-testid="temp-password"
              class="flex-1 rounded-md bg-elevated px-3 py-2 font-mono text-lg tracking-wider"
            >{{ temporaryPassword }}</code>
            <UButton
              :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copied ? 'Copied' : 'Copy'"
              color="neutral"
              variant="outline"
              @click="copy(temporaryPassword)"
            />
          </div>
        </div>
        <div
          v-else
          class="space-y-3"
        >
          <p class="text-sm">
            <span class="font-medium">{{ target?.name }}</span> ({{ target?.email }}) won't be able to log in with their current password. You'll get a temporary password to give them.
          </p>
          <UAlert
            v-if="resetError"
            color="error"
            variant="subtle"
            :title="resetError"
          />
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <template v-if="temporaryPassword">
            <UButton
              label="Done"
              @click="closeModal"
            />
          </template>
          <template v-else>
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              :disabled="resetting"
              @click="closeModal"
            />
            <UButton
              data-testid="confirm-reset"
              label="Reset password"
              color="warning"
              :loading="resetting"
              @click="confirmReset"
            />
          </template>
        </div>
      </template>
    </UModal>
  </div>
</template>
