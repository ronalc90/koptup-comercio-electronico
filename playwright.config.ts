import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config para Meraki.
 * - Usa el baseURL de MERAKI_E2E_BASE_URL (ej: preview deploy de Vercel)
 *   o http://localhost:3000 si corrés `npm run dev` en otra terminal.
 * - En CI: usamos `webServer` para levantar un build local.
 * - Los tests de auth requieren MERAKI_E2E_USER y MERAKI_E2E_PASSWORD.
 *   Si no están definidos, los tests con @auth se saltan (skip).
 */
const baseURL = process.env.MERAKI_E2E_BASE_URL || 'http://localhost:3000';
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Si no pasas un baseURL externo, Playwright levanta `next start`.
  webServer: process.env.MERAKI_E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: !isCI,
        timeout: 180_000,
      },
});
