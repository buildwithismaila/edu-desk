import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      {
        // Same root alias Nuxt uses, so tests can import server/ and shared/ code
        resolve: {
          alias: { '~~': fileURLToPath(new URL('.', import.meta.url)) },
        },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
          environment: 'node',
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['tests/nuxt/**/*.test.ts'],
          environment: 'nuxt',
          // First mount per file boots the Nuxt app (20-35s cold on the dev machine); later mounts take ms
          testTimeout: 60_000,
          environmentOptions: {
            nuxt: {
              domEnvironment: 'happy-dom',
            },
          },
        },
      }),
    ],
  },
})
