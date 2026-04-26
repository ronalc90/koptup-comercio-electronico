/**
 * Smoke tests — sin auth. Validan que la app arranca, la ruta de login
 * renderiza y las páginas protegidas redirigen a /login cuando no hay sesión.
 */
import { test, expect } from '@playwright/test';

test.describe('smoke: app responde y la ruta de auth está protegida', () => {
  test('GET / redirige o muestra algo renderizado', async ({ page }) => {
    const response = await page.goto('/');
    // Raíz puede ser 200 (si hay sesión) o redirigir a /login (si no).
    expect(response?.status()).toBeLessThan(500);
  });

  test('/login renderiza el formulario', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
  });

  test('ruta protegida sin sesión redirige a /login', async ({ page, context }) => {
    // Aseguramos que no hay cookies de sesión previas.
    await context.clearCookies();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });

  test('password mal no ingresa', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#username').fill('Paola');
    await page.locator('#password').fill('contraseña-invalida-123456');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    // Tras un submit fallido, seguimos en /login (no hay redirect).
    await expect(page).toHaveURL(/\/login/);
  });
});
