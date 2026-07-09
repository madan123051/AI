export const privateAppRoutes = [
  "/dashboard",
  "/projects",
  "/tasks",
  "/inbox",
  "/chat",
  "/publisher",
  "/media",
  "/connectors",
  "/approvals",
  "/settings",
  "/ai-brain",
  "/content",
  "/rules",
  "/memory",
  "/analytics",
  "/automation",
];

export const privateApiRoutes = [
  "/api/ai",
  "/api/approvals",
  "/api/chat",
  "/api/connectors/email/test",
  "/api/handoff",
  "/api/tasks",
];

export const authCookieName = "ai-control-auth";

export function isRouteMatch(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function isPrivateAppPath(pathname: string) {
  return isRouteMatch(pathname, privateAppRoutes);
}

export function isPrivateApiPath(pathname: string) {
  return isRouteMatch(pathname, privateApiRoutes);
}
