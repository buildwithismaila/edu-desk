import { defineConfig, devices } from '@playwright/test'

const PORT = 3100

export default defineConfig({
  testDir: 'tests/e2e',
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
    url: `http://127.0.0.1:${PORT}`,
    env: { HOST: '127.0.0.1', PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
