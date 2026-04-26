/**
 * Helpers compartidos para tests E2E.
 * Mantiene la configuración de auth y navegación en un solo lugar.
 */
import { expect, type Page } from '@playwright/test';

export const E2E_USER = process.env.MERAKI_E2E_USER || 'Paola';
export const E2E_PASSWORD = process.env.MERAKI_E2E_PASSWORD || '';

export function hasAuthCreds(): boolean {
  return Boolean(E2E_PASSWORD);
}

/** Completa el flujo de login y deja a la sesión activa. */
export async function login(page: Page, opts?: { user?: string; password?: string }) {
  const user = opts?.user ?? E2E_USER;
  const password = opts?.password ?? E2E_PASSWORD;

  await page.goto('/login');
  await page.locator('#username').fill(user);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /ingresar|entrar|iniciar/i }).click();
  await expect(page).toHaveURL(/\/dashboard|\/$/);
}
