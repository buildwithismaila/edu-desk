<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { ROLE_LABELS } from '#shared/constants/roles'

defineProps<{ collapsed?: boolean }>()

const { user, fetch: refreshSession } = useUserSession()

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
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
