import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Use Better Auth's official function to check for session cookie
  // This works in Edge Runtime without database access
  const sessionCookie = getSessionCookie(request);

  // Public routes that don't require auth
  const isPublicRoute = pathname === "/login" || 
                       pathname === "/" || 
                       pathname.startsWith("/api/auth") ||
                       pathname.startsWith("/_next") ||
                       pathname.startsWith("/static") ||
                       pathname.includes("."); // Static files

  // If user has session cookie and trying to access login page, redirect to dashboard
  if (sessionCookie && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Protected routes - check for session cookie
  if (!sessionCookie && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
