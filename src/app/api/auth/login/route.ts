import { NextRequest, NextResponse } from 'next/server';
import { login } from '@/lib/auth';
import { rateLimit, clearRateLimit } from '@/lib/rateLimit';

// Anti fuerza bruta: 8 intentos por (IP + usuario) cada 10 min. Best-effort
// (en memoria por instancia). Un login exitoso resetea el contador.
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: 'Usuario y contraseña requeridos' }, { status: 400 });
  }

  // IP confiable: x-real-ip (lo fija Vercel) o el ÚLTIMO valor de x-forwarded-for
  // (el que agrega la plataforma). El primero de XFF lo controla el cliente y se
  // podría falsear para evadir el límite. El username queda como segundo factor.
  const xff = request.headers.get('x-forwarded-for');
  const ip = request.headers.get('x-real-ip')?.trim()
    || xff?.split(',').pop()?.trim()
    || 'unknown';
  const rlKey = `login:${ip}:${String(username).toLowerCase().trim()}`;
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

  const response = NextResponse.json({ success: true, username });
  response.cookies.set('meraki-session', result.token!, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
  });

  return response;
}
