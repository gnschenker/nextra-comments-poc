import { defineConfig } from '@playwright/test'

const port = process.env.PORT ?? '3333'
const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: origin,
    browserName: 'chromium',
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    video: { mode: 'on', size: { width: 1280, height: 720 } }
  },
  webServer: {
    command: 'npm run dev',
    url: origin,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: port,
      DATABASE_URL: process.env.DATABASE_URL ?? 'file:./prisma/e2e.db'
    }
  }
})
