import type { HTMLBundle, SQL } from "bun";
import type { Auth } from "./auth/auth";
import { apiRoutes } from "./api/routes";

/**
 * Every route the server answers. The frontend is a parameter so tests can mount the whole table
 * without the bundler: what matters here is which paths serve a page, not what is in it.
 */
export type AppRoutesDeps = { sql: SQL; auth: Auth; frontend: HTMLBundle | Response };

export function appRoutes({ sql, auth, frontend }: AppRoutesDeps) {
  return {
    "/api/auth/*": (req: Request) => auth.handler(req),

    ...apiRoutes({ sql, auth }),

    /**
     * Every HTML path serves the bundle, deep links included, and none of them creates an
     * Account. The client asks for its own session once the app boots (ADR-0003) — a server that
     * minted one per page load gave a bookmarked `/lists/abc` no Account at all, since only the
     * exact `/` went through the handler that did it.
     */
    "/*": frontend,
  };
}
