import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against `pnpm dev` with the demo (mock) Picnic adapter and local D1.
 * They never talk to Picnic and never place orders.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    locale: 'nl-NL',
    timezoneId: 'Europe/Amsterdam',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
    { name: 'iphone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', colorScheme: 'light' } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    // Without PICNIC_TOKEN_ENCRYPTION_KEY in .dev.vars the Worker runs in demo (mock) mode.
    timeout: 120_000,
  },
});
