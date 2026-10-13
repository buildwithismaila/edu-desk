import type { NavigationMenuItem } from '@nuxt/ui'
import type { Role } from '#shared/constants/roles'

type NavItem = Omit<NavigationMenuItem, 'children'> & { roles?: readonly Role[], children?: NavItem[] }

// Items without `roles` are for everyone. Keep `roles` in step with the page's definePageMeta({ roles }).
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: 'Students', icon: 'i-lucide-graduation-cap', to: '/students', roles: ['admin', 'principal', 'bursar', 'teacher'] },
  { label: 'Attendance', icon: 'i-lucide-clipboard-check', to: '/attendance', roles: ['admin', 'principal', 'teacher'] },
  { label: 'Scores', icon: 'i-lucide-notebook-pen', to: '/scores', roles: ['admin', 'principal', 'teacher'] },
  { label: 'Results', icon: 'i-lucide-award', to: '/results', roles: ['admin', 'principal', 'teacher'] },
  { label: 'Staff', icon: 'i-lucide-users', to: '/staff', roles: ['admin', 'principal'] },
  { label: 'Assignments', icon: 'i-lucide-clipboard-list', to: '/assignments', roles: ['admin', 'principal'] },
  {
    label: 'School setup',
    icon: 'i-lucide-settings',
    roles: ['admin'],
    defaultOpen: true,
    children: [
      { label: 'School profile', icon: 'i-lucide-school', to: '/settings/school' },
      { label: 'Calendar', icon: 'i-lucide-calendar', to: '/settings/calendar' },
      { label: 'Classes', icon: 'i-lucide-layers', to: '/settings/classes' },
      { label: 'Subjects', icon: 'i-lucide-book-open', to: '/settings/subjects' },
      { label: 'Assessment & grading', icon: 'i-lucide-percent', to: '/settings/grading' },
    ],
  },
]

function visibleTo(items: NavItem[], role: Role): NavigationMenuItem[] {
  return items
    .filter(item => !item.roles || item.roles.includes(role))
    .map(({ roles: _roles, children, ...item }) => children ? { ...item, children: visibleTo(children, role) } : item)
}

/** Sidebar items the role can use. Hiding is only UX: the server checks roles on every route. */
export function navigationFor(role: Role): NavigationMenuItem[] {
  return visibleTo(NAV_ITEMS, role)
}
