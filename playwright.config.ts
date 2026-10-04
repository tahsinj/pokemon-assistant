import { defineConfig } from '@playwright/test';

const PORT = 5174;

export default defineConfig({
  testDir: 'tests/ui',
  outputDir: 'test-results/ui',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'test-results/ui-report' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  projects: [
    // The app's minimum window size, and a common desktop size.
    { name: 'min', use: { viewport: { width: 1100, height: 700 } } },
    { name: 'large', use: { viewport: { width: 1920, height: 1080 } } },
  ],
  // A production build, not the dev server: no dependency pre-bundling or
  // reloads mid-test, and it is what ships.
  webServer: {
    command: `npm run build:renderer && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
