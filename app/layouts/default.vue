<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

// Role-based nav arrives in Phase 1
const links: NavigationMenuItem[] = [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/' },
]
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
