// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@vueuse/nuxt', '@nuxt/image', 'nuxt-auth-utils'],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  // Overridden at runtime by NUXT_APP_DOMAIN / NUXT_DEFAULT_SCHOOL_SLUG (see docs/multi-tenancy.md)
  runtimeConfig: {
    appDomain: 'lvh.me',
    defaultSchoolSlug: '',
    // NUXT_TRUST_PROXY=true behind Caddy (deploy/): the login limit then uses the forwarded client IP
    trustProxy: false,
    // nuxt-auth-utils session (password from NUXT_SESSION_PASSWORD). Host-only cookie: no `domain`,
    // so each school subdomain has its own session. Chrome drops Secure cookies on http://*.lvh.me,
    // so Secure is off under `nuxt dev`; E2E (http prod build) sets NUXT_SESSION_COOKIE_SECURE=false.
    session: {
      maxAge: 60 * 60 * 24 * 7,
      cookie: {
        sameSite: 'lax',
        secure: process.env.NODE_ENV !== 'development',
      },
    },
  },

  // Phase 1's Users page became Staff in Phase 3
  routeRules: {
    '/users': { redirect: '/staff' },
  },

  // *.lvh.me resolves to 127.0.0.1; the default `localhost` may bind IPv6 (::1) only
  devServer: { host: '127.0.0.1' },

  compatibilityDate: '2026-10-01',

  nitro: {
    // School uploads (logos for now), keyed schools/<schoolId>/…; production needs .data on a persistent volume
    storage: {
      uploads: { driver: 'fs', base: './.data/uploads' },
    },
  },

  vite: {
    server: {
      allowedHosts: ['.lvh.me'],
    },
  },

  typescript: {
    strict: true,
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },
})
