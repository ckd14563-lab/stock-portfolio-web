import { NextRequest, NextResponse } from 'next/server';

function isPublic(pathname: string) {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const secret = (process.env.PERSONAL_TOKEN ?? '').trim();
  if (!secret) return NextResponse.next();

  const cookieToken = req.cookies.get('auth_token')?.value ?? '';
  if (cookieToken !== secret) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
