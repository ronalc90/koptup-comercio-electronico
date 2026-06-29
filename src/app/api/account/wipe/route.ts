import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getScopedServiceClient } from '@/lib/tenantServer';
import { DESTRUCTIVE_CONFIRM_PHRASE as CONFIRMATION_PHRASE } from '@/lib/assistant/constants';

/**
 * Vacía todos los datos de negocio de la cuenta (pedidos, inventario,
 * productos, gastos, alertas y proveedores) dejándola como nueva. Requiere que
 * el usuario envíe la frase de confirmación exacta "Acepto".
 *
 * Conserva:
 *   - la fila de settings con openai_api_key (la cuenta sigue operativa)
 *   - la sesión (la persona puede seguir usando la app tras el borrado).
 *   - el historial de cargos (`charges`): es registro de facturación/licencia.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  let body: { confirmation?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const confirmation = typeof body.confirmation === 'string' ? body.confirmation.trim() : '';
  if (confirmation !== CONFIRMATION_PHRASE) {
    return NextResponse.json(
      { error: `Debes escribir "${CONFIRMATION_PHRASE}" para confirmar` },
      { status: 400 },
    );
  }

  try {
    // Cliente acotado al tenant del usuario: el wipe SOLO borra los datos de
    // su propio negocio, nunca los de otro tenant.
    const supabase = await getScopedServiceClient(session);

    // Borrar usando una condición siempre verdadera en la PK (id > 0).
    // `suppliers` va al FINAL: products/orders lo referencian por FK
    // (supplier_id, migración 016); para entonces ya están borrados.
    const tables = ['orders', 'inventory', 'products', 'expenses', 'alerts', 'suppliers'] as const;
    const errors: string[] = [];

    for (const table of tables) {
      const { error } = await supabase.from(table).delete().gt('id', 0);
      if (error) errors.push(`${table}: ${error.message}`);
    }

    if (errors.length > 0) {
      console.error('Account wipe partial failure:', errors);
      return NextResponse.json(
        { error: `Error al borrar algunos datos: ${errors.join('; ')}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Cuenta restablecida. Todos los datos fueron eliminados.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('Account wipe error:', message);
    return NextResponse.json(
      { error: 'No se pudo restablecer la cuenta' },
      { status: 500 },
    );
  }
}
