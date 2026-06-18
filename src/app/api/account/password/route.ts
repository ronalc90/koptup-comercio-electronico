import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  hashPassword,
  validatePassword,
  verifyPassword,
} from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Cambia la contraseña del usuario autenticado (la suya propia).
 *
 * Seguridad:
 *   - Requiere sesión válida.
 *   - Solo opera sobre la fila del propio usuario, acotada por id + tenant_id,
 *     de modo que nadie pueda tocar la contraseña de otro usuario o tenant.
 *   - Verifica la contraseña actual antes de permitir el cambio.
 *   - Aplica la política mínima de contraseñas a la nueva.
 *   - Mensajes de error genéricos: nunca se filtran errores crudos de la BD.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  // Usuario de respaldo pre-migración (sin fila en `users`): no hay dónde
  // persistir el cambio de contraseña.
  if (session.userId == null) {
    return NextResponse.json(
      { error: 'No disponible para este usuario' },
      { status: 400 },
    );
  }

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const currentPassword = body.currentPassword;
  const newPassword = body.newPassword;
  if (
    typeof currentPassword !== 'string' ||
    currentPassword.length === 0 ||
    typeof newPassword !== 'string' ||
    newPassword.length === 0
  ) {
    return NextResponse.json(
      { error: 'Debes ingresar la contraseña actual y la nueva' },
      { status: 400 },
    );
  }

  // Regla de negocio antes de tocar la BD.
  const policyError = validatePassword(newPassword);
  if (policyError) {
    return NextResponse.json({ error: policyError }, { status: 400 });
  }

  try {
    const db = getServiceClient();

    const { data, error } = await db
      .from('users')
      .select('password_hash')
      .eq('id', session.userId)
      .eq('tenant_id', session.tenantId)
      .maybeSingle();

    if (error || !data) {
      console.error('Password change lookup error:', error?.message);
      return NextResponse.json(
        { error: 'No se pudo cambiar la contraseña' },
        { status: 500 },
      );
    }

    const currentOk = await verifyPassword(currentPassword, data.password_hash);
    if (!currentOk) {
      return NextResponse.json(
        { error: 'La contraseña actual no es correcta' },
        { status: 400 },
      );
    }

    const newHash = await hashPassword(newPassword);
    const { error: updateError } = await db
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', session.userId)
      .eq('tenant_id', session.tenantId);

    if (updateError) {
      console.error('Password change update error:', updateError.message);
      return NextResponse.json(
        { error: 'No se pudo cambiar la contraseña' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Password change error:', message);
    return NextResponse.json(
      { error: 'No se pudo cambiar la contraseña' },
      { status: 500 },
    );
  }
}
