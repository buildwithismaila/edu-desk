import { defineConfig, devices } from '@playwright/test'
import { e2eDatabaseUrl } from './tests/e2e/support/database'

const PORT = 3100

export default defineConfig({
  testDir: 'tests/e2e',
  // Creates (if needed), migrates and seeds the E2E database before the run
  globalSetup: './tests/e2e/support/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://greenfield.lvh.me:${PORT}`,
    trace: 'retain-on-failure',
    // Resolve *.lvh.me locally so E2E never depends on public DNS
    launchOptions: {
      args: ['--host-resolver-rules=MAP *.lvh.me 127.0.0.1'],
    },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 667 },
      },
    },
  ],
  webServer: {
    command: 'pnpm build && node .output/server/index.mjs',
    // Wait for the port, not a URL: a bare IP host has no school, so every page answers 404
    port: PORT,
    // The production server doesn't read .env, so pass everything it needs explicitly
    env: {
      HOST: '127.0.0.1',
      PORT: String(PORT),
      DATABASE_URL: e2eDatabaseUrl(),
      NUXT_APP_DOMAIN: 'lvh.me',
      NUXT_DEFAULT_SCHOOL_SLUG: '',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
