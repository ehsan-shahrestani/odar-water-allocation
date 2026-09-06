import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4300',
    viewport: { width: 390, height: 844 },
    locale: 'fa-IR',
    launchOptions: {
      executablePath:
        process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] || '/usr/bin/google-chrome',
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'node scripts/serve-test.mjs',
    url: 'http://127.0.0.1:4300',
    reuseExistingServer: false,
  },
});
