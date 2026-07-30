import { NextResponse, type NextRequest } from 'next/server';

/** Must match the cookie names issued by the API (`auth.controller.ts`). */
const ACCESS_TOKEN_COOKIE = 'educore_access_token';
const REFRESH_TOKEN_COOKIE = 'educore_refresh_token';

/** Routes reachable without a session. */
const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password'];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Optimistic session gate (Next 16 renamed `middleware` to `proxy`).
 *
 * This only checks for the *presence* of a session cookie so unauthenticated
 * visitors never see a protected shell flash. It is not authorization — the API
 * verifies the token and the caller's permissions on every request.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  const hasSession =
    request.cookies.has(ACCESS_TOKEN_COOKIE) || request.cookies.has(REFRESH_TOKEN_COOKIE);

  if (!hasSession && !isPublicRoute(pathname)) {
    const loginUrl = new URL('/login', request.url);
    // Preserve the destination so sign-in can return the user to it.
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', `${pathname}${search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && isPublicRoute(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, the favicon, and static assets.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
