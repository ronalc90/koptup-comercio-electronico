import { NextResponse } from 'next/server';
import { COOKIE_NAME, LEGACY_COOKIE_NAME } from '@/lib/sessionCookie';

export async function POST() {
  const response = NextResponse.json({ success: true });
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
    path: '/',
  };
  // Limpia la cookie nueva y también la histórica (por si quedó del nombre viejo).
  response.cookies.set(COOKIE_NAME, '', opts);
  response.cookies.set(LEGACY_COOKIE_NAME, '', opts);
  return response;
}
