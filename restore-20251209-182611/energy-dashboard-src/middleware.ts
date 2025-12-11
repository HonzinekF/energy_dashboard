import { NextRequest, NextResponse } from "next/server";

const publicPaths = ["/login", "/api/login", "/api/imports/update", "/_next", "/favicon.ico"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = publicPaths.some((path) => pathname.startsWith(path));
  const session = request.cookies.get("solax-session")?.value;

  if (!isPublic && session !== "ok") {
    const loginUrl = new URL("/login", request.url);
    const redirectTarget = buildRedirectTarget(request);
    loginUrl.searchParams.set("redirectTo", redirectTarget);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && session === "ok") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

function buildRedirectTarget(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const search = request.nextUrl.search ?? "";
  const target = `${pathname}${search}`;
  if (!target.startsWith("/") || target.startsWith("/login")) {
    return "/";
  }
  return target;
}
