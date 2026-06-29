import { NextRequest, NextResponse } from 'next/server';
import { login } from '@/lib/auth';
import { rateLimit, clearRateLimit } from '@/lib/rateLimit';
import { COOKIE_NAME } from '@/lib/sessionCookie';

// Anti fuerza bruta: 12 intentos por IP cada 10 min. Best-effort (en memoria por
// instancia). Un login exitoso resetea el contador. Se limita por IP y NO por
// usuario, para que un atacante no pueda bloquear a propósito una cuenta conocida
// (DoS dirigido); el usuario legítimo desde su propia IP no se ve afectado.
const MAX_ATTEMPTS = 12;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = body?.username;
  const password = body?.password;

  // Validar TIPOS (no solo presencia): un objeto/array evitaba esto y reventaba
  // con 500 más adelante.
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return NextResponse.json({ error: 'Usuario y contraseña requeridos' }, { status: 400 });
  }

  // IP confiable: x-real-ip (lo fija Vercel) o el ÚLTIMO valor de x-forwarded-for
  // (el que agrega la plataforma). El primero de XFF lo controla el cliente y se
  // podría falsear para evadir el límite.
  const xff = request.headers.get('x-forwarded-for');
  const ip = request.headers.get('x-real-ip')?.trim()
    || xff?.split(',').pop()?.trim()
    || 'unknown';
  const rlKey = `login:${ip}`;
  const rl = rateLimit(rlKey, MAX_ATTEMPTS, WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Demasiados intentos. Esperá ${rl.retryAfterSec}s e intentá de nuevo.` },
      { status: 429 },
    );
  }

  const result = await login(username, password);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  clearRateLimit(rlKey); // login OK → resetear el contador de intentos

  const isSecure = process.env.NODE_ENV === 'production'
    || request.nextUrl.protocol === 'https:';

  const response = NextResponse.json({ success: true, username, role: result.context?.role ?? 'member' });
  response.cookies.set(COOKIE_NAME, result.token!, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
  });

  return response;
}
