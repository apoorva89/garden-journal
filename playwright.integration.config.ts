import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-integration',
  timeout: 60_000,
  projects: [
    { name: 'node', use: {} },
  ],
})
