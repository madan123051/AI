import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authCookieName, isPrivateApiPath, isPrivateAppPath } from "@/lib/authRoutes";

function hasAuthMarker(request: NextRequest) {
  return request.cookies.get(authCookieName)?.value === "1";
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPrivateApiPath(pathname) && !hasAuthMarker(request)) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (isPrivateAppPath(pathname) && !hasAuthMarker(request)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${search}`);

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/projects/:path*",
    "/tasks/:path*",
    "/inbox/:path*",
    "/publisher/:path*",
    "/media/:path*",
    "/connectors/:path*",
    "/approvals/:path*",
    "/settings/:path*",
    "/ai-brain/:path*",
    "/content/:path*",
    "/rules/:path*",
    "/memory/:path*",
    "/analytics/:path*",
    "/automation/:path*",
    "/api/ai/:path*",
    "/api/approvals/:path*",
    "/api/connectors/email/test",
    "/api/handoff/:path*",
    "/api/tasks/:path*",
  ],
};
