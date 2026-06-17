import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout'];
const PROTECTED_PREFIXES = ['/dashboard', '/orders', '/inventory', '/products', '/dispatch', '/settings', '/assistant', '/agents', '/admin', '/superadmin', '/billing', '/api/ai', '/api/agents', '/api/automations', '/api/admin', '/api/superadmin', '/api/billing', '/api/settings', '/api/export', '/api/import', '/api/upload-image', '/api/account'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/_next') || pathname.startsWith('/icons') || pathname === '/manifest.json' || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  const isProtected = pathname === '/' || PROTECTED_PREFIXES.some(p => pathname.startsWith(p));

  if (isProtected) {
    const token = request.cookies.get('meraki-session')?.value;

    if (!token) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Token exists - let it through (verification happens in the session check)
    // We can't await here in proxy, so we do a basic check
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
