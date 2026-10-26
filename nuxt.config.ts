import { uploadsStorageConfig } from './server/utils/storage-config'

const onCloudflare = !!process.env.NITRO_PRESET?.startsWith('cloudflare')

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@vueuse/nuxt', '@nuxt/image', 'nuxt-auth-utils', '@vite-pwa/nuxt'],

  devtools: { enabled: true },

  // iPhones use this for "Add to Home Screen" (the web manifest's icons are for Android)
  app: {
    head: {
      link: [{ rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
    },
  },

  css: ['~/assets/css/main.css'],

  // Overridden at runtime by NUXT_APP_DOMAIN / NUXT_DEFAULT_SCHOOL_SLUG (see docs/multi-tenancy.md)
  runtimeConfig: {
    appDomain: 'lvh.me',
    defaultSchoolSlug: '',
    // NUXT_TRUST_PROXY: `true` behind Caddy (deploy/), `cloudflare` on Cloudflare Workers (server/utils/client-ip.ts)
    trustProxy: false as boolean | 'cloudflare',
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
    // useEvent() for server/plugins/request-db.ts (a database client per request on Cloudflare)
    experimental: { asyncContext: true },
    // School uploads (logos, photos), keyed schools/<schoolId>/…: on disk for Node (a persistent volume in
    // production), in R2 on Cloudflare (server/utils/storage-config.ts)
    storage: {
      uploads: uploadsStorageConfig(process.env.NITRO_PRESET),
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

  // No <NuxtImg> is used; on Cloudflare skip the IPX image server (sharp can't run on Workers)
  image: onCloudflare ? { provider: 'none' } : {},

  // Installable app and offline attendance (docs/features/10c-offline-attendance.md, decision 048). The service
  // worker keeps the app's files and opened pages; it never caches API data (the attendance page keeps its own
  // copies on the phone), except icons, which hold no school data.
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Edu Desk',
      short_name: 'Edu Desk',
      description: 'School management: attendance, results and fees',
      theme_color: '#123B2F',
      background_color: '#F7F5EF',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // Pages are server-rendered per school and user: no app-shell fallback, only pages actually opened
      navigateFallback: null,
      globPatterns: ['**/*.{js,css,png,svg,ico,woff2}'],
      runtimeCaching: [
        {
          urlPattern: ({ request, url }) => request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
          handler: 'NetworkFirst',
          options: {
            // PAGES_CACHE in app/composables/useOfflineAttendance.ts (wiped at logout)
            cacheName: 'pages',
            networkTimeoutSeconds: 5,
            matchOptions: { ignoreSearch: true },
            expiration: { maxEntries: 20 },
          },
        },
        {
          urlPattern: ({ url }) => url.pathname.startsWith('/api/_nuxt_icon/'),
          handler: 'CacheFirst',
          options: { cacheName: 'icons', expiration: { maxEntries: 50 } },
        },
      ],
    },
    // The registering plugin imports a build-only virtual module that Vitest's Nuxt environment can't load
    client: { installPrompt: false, registerPlugin: !process.env.VITEST },
  },
})
