// The review flow in a real browser, against the real API and a real Postgres. The extractor
// replays recorded golden-set responses, so this runs on every push without API calls or cost.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3100;
const WEB_PORT = 5174;
const databaseUrl =
  process.env.E2E_DATABASE_URL ?? 'postgres://tally:tally@localhost:5432/tally_e2e';
const node = process.execPath;

export default defineConfig({
  testDir: 'tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // A fresh database every run: reset (only allowed on *_e2e), seed vendors, start the API.
      command: `${node} src/db/cli.ts reset && ${node} src/db/cli.ts seed && ${node} src/server.ts`,
      cwd: '../apps/api',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: databaseUrl,
        API_PORT: String(API_PORT),
        EXTRACTOR: 'replay',
        FILES_DIR: join(tmpdir(), `tally-e2e-files-${Date.now()}`),
        REVIEWER: 'e2e-reviewer',
      },
    },
    {
      command: `${node} node_modules/vite/bin/vite.js`,
      cwd: '../apps/web',
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { WEB_PORT: String(WEB_PORT), API_URL: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
