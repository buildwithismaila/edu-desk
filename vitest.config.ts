import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    // Each integration file holds its own PGlite (WASM heap) and runs scrypt: 3+ workers ran the 8 GB dev machine out of memory
    maxWorkers: 2,
    projects: [
      {
        // Same root alias Nuxt uses, so tests can import server/ and shared/ code
        resolve: {
          alias: {
            '~~': fileURLToPath(new URL('.', import.meta.url)),
            // Server code imports useRuntimeConfig from Nitro's virtual module
            '#imports': fileURLToPath(new URL('tests/helpers/nitro-imports.ts', import.meta.url)),
          },
        },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
          // nuxt-auth-utils server utils are Nitro auto-imports (globals) in server code
          setupFiles: ['tests/helpers/nitro-globals.ts'],
          environment: 'node',
          // Booting PGlite + migrations in beforeAll takes >10s when several files start in parallel
          hookTimeout: 60_000,
          // Integration tests build fixtures with several logins (deliberately slow scrypt hashing) inside the
          // test; on a busy machine that passes the 5s default without anything being wrong
          testTimeout: 20_000,
          // Each file compiles PGlite's WASM; TurboFan tier-up in parallel workers hit V8 "Fatal process out of memory: Zone"
          execArgv: ['--liftoff-only'],
          // Transform nuxt-auth-utils (instead of loading it natively) so its `#imports` uses the alias above
          server: { deps: { inline: ['nuxt-auth-utils'] } },
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['tests/nuxt/**/*.test.ts'],
          environment: 'nuxt',
          // First mount per file boots the Nuxt app (20-35s cold on the dev machine); later mounts take ms
          testTimeout: 60_000,
          hookTimeout: 60_000,
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
