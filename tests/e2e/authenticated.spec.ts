/**
 * Tests autenticados — requieren MERAKI_E2E_USER + MERAKI_E2E_PASSWORD.
 * Si no están configurados, el suite se saltea entero (skip).
 *
 * Cubre los flujos golden:
 *  - Navegar entre Inicio / Pedidos / Inventario / Despacho.
 *  - Modales de ayuda (?) en cada pantalla.
 *  - Orders: toggle Calendario ↔ Lista persiste en localStorage.
 *  - Asistente: abrir el librito, validar modal.
 */
import { test, expect } from '@playwright/test';
import { login, hasAuthCreds } from './helpers';

test.describe('auth: flujos golden con sesión activa', () => {
  test.skip(!hasAuthCreds(), 'Requiere MERAKI_E2E_USER y MERAKI_E2E_PASSWORD');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('navega entre las pantallas principales sin errores', async ({ page }) => {
    // Desde dashboard vamos a cada ruta; debería renderizar el header característico.
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: /pedidos/i }).first()).toBeVisible();

    await page.goto('/inventory');
    await expect(page.getByRole('heading', { name: /inventario/i }).first()).toBeVisible();

    await page.goto('/dispatch');
    await expect(page.getByRole('heading', { name: /despacho/i }).first()).toBeVisible();

    await page.goto('/assistant');
    await expect(page.getByRole('heading', { name: /asistente/i }).first()).toBeVisible();
  });

  test('los modales de ayuda abren y cierran en cada pantalla', async ({ page }) => {
    for (const path of ['/dashboard', '/orders', '/inventory', '/dispatch']) {
      await page.goto(path);
      const helpButton = page.getByLabel(/ayuda de/i).first();
      await helpButton.click();
      // Título del modal genérico tiene un ¿Entendido? al pie
      const close = page.getByRole('button', { name: 'Entendido' });
      await expect(close).toBeVisible();
      await close.click();
      await expect(close).not.toBeVisible();
    }
  });

  test('pedidos: toggle Calendario ↔ Lista persiste entre recargas', async ({ page }) => {
    await page.goto('/orders');
    // Cambiar a Lista
    await page.getByRole('button', { name: /lista/i }).click();
    // Aparece la barra de búsqueda propia de la vista Lista
    await expect(page.getByPlaceholder(/buscar por código/i)).toBeVisible();

    // Recargar y validar que persiste
    await page.reload();
    await expect(page.getByPlaceholder(/buscar por código/i)).toBeVisible();

    // Volver a Calendario
    await page.getByRole('button', { name: /calendario/i }).click();
    await expect(page.getByPlaceholder(/buscar por código/i)).not.toBeVisible();
  });

  test('asistente: el librito abre y muestra la sección de ayuda', async ({ page }) => {
    await page.goto('/assistant');
    await page.getByLabel(/librito/i).click();
    await expect(page.getByRole('heading', { name: /librito de días/i })).toBeVisible();
    // El botón "?" dentro del modal debe existir (ayuda del librito)
    await page.getByLabel(/ayuda del librito/i).click();
    await expect(page.getByText(/¿Para qué sirve el librito\?/i)).toBeVisible();
  });
});
