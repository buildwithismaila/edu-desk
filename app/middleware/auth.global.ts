// Page access by session and role. UX only: every API route enforces auth and roles itself.
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user } = useUserSession()

  if (to.meta.public) {
    if (loggedIn.value && to.path === '/login') return navigateTo('/')
    return
  }

  if (!loggedIn.value || !user.value) return navigateTo({ path: '/login', query: { redirect: to.fullPath } })

  if (user.value.mustChangePassword && to.path !== '/account/password') return navigateTo('/account/password')

  if (to.meta.roles && !to.meta.roles.includes(user.value.role)) {
    // The default layout shows the "no access" toast and removes the flag (works after an SSR redirect too)
    return navigateTo({ path: '/', query: { forbidden: '1' } })
  }
})
