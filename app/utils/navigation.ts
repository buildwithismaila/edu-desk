import type { NavigationMenuItem } from '@nuxt/ui'
import type { Role } from '#shared/constants/roles'

type NavItem = NavigationMenuItem & { roles?: readonly Role[] }

// Items without `roles` are for everyone. Keep `roles` in step with the page's definePageMeta({ roles }).
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: 'Users', icon: 'i-lucide-users', to: '/users', roles: ['admin'] },
]

/** Sidebar items the role can use. Hiding is only UX: the server checks roles on every route. */
export function navigationFor(role: Role): NavigationMenuItem[] {
  return NAV_ITEMS
    .filter(item => !item.roles || item.roles.includes(role))
    .map(({ roles: _roles, ...item }) => item)
}
