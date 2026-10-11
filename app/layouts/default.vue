<script setup lang="ts">
const { user } = useUserSession()
const links = computed(() => user.value ? navigationFor(user.value.role) : [])

// auth.global.ts redirects here with ?forbidden=1 when the role can't open a page
const route = useRoute()
const router = useRouter()
const toast = useToast()
if (import.meta.client) {
  watch(() => route.query.forbidden, (forbidden) => {
    if (!forbidden) return
    toast.add({ title: 'You don\'t have access to that page', color: 'error', icon: 'i-lucide-shield-x' })
    router.replace({ query: { ...route.query, forbidden: undefined } })
  }, { immediate: true })
}
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar
      collapsible
      data-testid="sidebar"
    >
      <template #header="{ collapsed }">
        <LayoutSchoolBrand :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :items="links"
          :collapsed="collapsed"
          orientation="vertical"
        />
      </template>

      <template #footer="{ collapsed }">
        <LayoutUserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar :toggle="false">
          <template #leading>
            <!-- Toggle opens the slideover on mobile; collapse shrinks the sidebar on desktop -->
            <UDashboardSidebarToggle data-testid="sidebar-toggle" />
            <UDashboardSidebarCollapse data-testid="sidebar-collapse" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
