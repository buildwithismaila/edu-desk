// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@vueuse/nuxt', '@nuxt/image'],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  // Overridden at runtime by NUXT_APP_DOMAIN / NUXT_DEFAULT_SCHOOL_SLUG (see docs/multi-tenancy.md)
  runtimeConfig: {
    appDomain: 'lvh.me',
    defaultSchoolSlug: '',
  },

  // *.lvh.me resolves to 127.0.0.1; the default `localhost` may bind IPv6 (::1) only
  devServer: { host: '127.0.0.1' },

  compatibilityDate: '2026-10-01',

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
