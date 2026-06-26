/**
 * E2E del flujo conversacional de parseo de pedidos por IA.
 * Mockea /api/ai/parse-order (sin OpenAI ni DB real) para validar que:
 *  - cuando el pedido es ambiguo, el asistente PREGUNTA y NO muestra confirmación;
 *  - cuando el usuario responde y el pedido queda completo, aparece la tarjeta de
 *    confirmación (manteniendo el contexto entre turnos).
 *
 * Requiere MERAKI_E2E_USER + MERAKI_E2E_PASSWORD (si no, se saltea).
 * No confirma el pedido para no insertar filas en la base de datos.
 */
import { test, expect } from '@playwright/test';
import { login, hasAuthCreds } from './helpers';

test.describe('auth: parseo conversacional de pedidos por IA', () => {
  test.skip(!hasAuthCreds(), 'Requiere MERAKI_E2E_USER y MERAKI_E2E_PASSWORD');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('pide aclaración ante ambigüedad y confirma al completar', async ({ page }) => {
    // Secuencia de respuestas mockeadas del endpoint: 1) falta color, 2) completo.
    const responses = [
      {
        status: 'needs_clarification',
        questions: ['¿De qué color es la tercera pantufla? Disponibles: rojo, azul.'],
        message: '¿De qué color es la tercera pantufla? Disponibles: rojo, azul.',
        partial: { client_name: 'Carlos', phone: '3203436512', value_to_collect: 60000 },
      },
      {
        status: 'complete',
        order: {
          client_name: 'Carlos',
          phone: '3203436512',
          address: 'Calle 80 #1-2',
          complement: '',
          detail: '3 x Pantufla rojo',
          value_to_collect: 60000,
          city: 'Bogotá',
          product_ref: '',
          comment: '',
        },
        message: 'Pedido de Carlos: 3 x Pantufla rojo.',
      },
    ];
    let call = 0;
    await page.route('**/api/ai/parse-order', async (route) => {
      const body = responses[Math.min(call, responses.length - 1)];
      call += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.goto('/orders/new');
    await page.getByRole('button', { name: /pedido ia/i }).click();

    const box = page.getByPlaceholder(/pega el pedido aquí/i);

    // Turno 1: pedido ambiguo → debe PREGUNTAR y NO confirmar.
    await box.fill('Carlos 3203436512, Calle 80 #1-2, 3 pantuflas, 2 rojas y 1, $60000');
    await page.getByRole('button', { name: 'Enviar pedido' }).click();

    await expect(page.getByText(/de qué color es la tercera pantufla/i)).toBeVisible();
    await expect(page.getByText('¿Confirmar este pedido?')).toHaveCount(0);

    // Turno 2: el usuario responde → pedido completo → aparece confirmación.
    await box.fill('roja');
    await page.getByRole('button', { name: 'Enviar pedido' }).click();

    await expect(page.getByText('¿Confirmar este pedido?')).toBeVisible();
    await expect(page.getByText(/3 x Pantufla rojo/i)).toBeVisible();

    // El endpoint se invocó dos veces (contexto mantenido entre turnos).
    expect(call).toBe(2);
  });

  test('degradación elegante cuando la IA no está disponible', async ({ page }) => {
    await page.route('**/api/ai/parse-order', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'not_order',
          code: 'AI_UNAVAILABLE',
          message: 'El asistente de IA no está disponible ahora. Crea el pedido en la pestaña "Formulario".',
        }),
      });
    });

    await page.goto('/orders/new');
    await page.getByRole('button', { name: /pedido ia/i }).click();

    await page.getByPlaceholder(/pega el pedido aquí/i).fill('Hola, un pedido');
    await page.getByRole('button', { name: 'Enviar pedido' }).click();

    // Muestra el mensaje guía en el chat (no crashea ni se queda en error genérico).
    await expect(page.getByText(/no está disponible/i)).toBeVisible();
    await expect(page.getByText('¿Confirmar este pedido?')).toHaveCount(0);
  });
});
