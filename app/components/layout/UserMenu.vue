<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { ROLE_LABELS } from '#shared/constants/roles'

defineProps<{ collapsed?: boolean }>()

const { user, fetch: refreshSession } = useUserSession()
const confirm = useConfirmDialog()
const offline = useOfflineAttendance()

// Everything saved on the phone is wiped at logout (shared phones), so warn about registers not sent yet
async function logout() {
  await offline.refreshOutbox()
  const unsent = offline.outbox.value.filter(e => e.state !== 'sent').length
  if (unsent && !await confirm({
    title: `${unsent} register${unsent === 1 ? '' : 's'} not sent yet`,
    description: 'Logging out deletes everything Edu Desk saved on this phone, including registers that haven\'t been sent. Go online and send them first, or log out anyway.',
    confirmLabel: 'Log out anyway',
  })) return
  await $fetch('/api/auth/logout', { method: 'POST' })
  await offline.wipe()
  await refreshSession()
  await navigateTo('/login')
}

const items = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: user.value?.name, description: user.value ? ROLE_LABELS[user.value.role] : undefined }],
  [{ label: 'Change password', icon: 'i-lucide-key-round', to: '/account/password' }],
  [{ label: 'Log out', icon: 'i-lucide-log-out', onSelect: logout }],
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      data-testid="user-menu"
      icon="i-lucide-circle-user-round"
      :label="collapsed ? undefined : user?.name"
      :aria-label="collapsed ? user?.name : undefined"
      trailing-icon="i-lucide-chevrons-up-down"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{ trailingIcon: 'text-dimmed', label: 'truncate' }"
    />
  </UDropdownMenu>
</template>
