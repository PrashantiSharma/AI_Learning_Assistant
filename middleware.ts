import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";

const PUBLIC_PAGE_PATHS = new Set(["/", "/login", "/register"]);
const PUBLIC_API_PREFIXES = ["/api/auth/"];

function isStaticPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml")
  );
}

function isPublicApi(pathname: string) {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isStaticPath(pathname)) return NextResponse.next();

  const hasSessionCookie = Boolean(req.cookies.get(AUTH_COOKIE_NAME)?.value?.trim());
  const isApi = pathname.startsWith("/api/");
  const isPublicPage = PUBLIC_PAGE_PATHS.has(pathname);

  if (isApi) {
    if (isPublicApi(pathname)) return NextResponse.next();
    if (!hasSessionCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!isPublicPage && !hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
