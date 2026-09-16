import type { HTMLBundle, SQL } from "bun";
import type { Auth } from "./auth/auth";
import { apiRoutes } from "./api/routes";
import { socketRoutes } from "./api/socket";

/**
 * Every route the server answers. The frontend is a parameter so tests can mount the whole table
 * without the bundler: what matters here is which paths serve a page, not what is in it.
 *
 * The socket's `websocket` handler is not here and cannot be: `serve` takes it as a sibling of
 * `routes`, so every caller of this function passes it separately (`src/api/socket.ts`).
 */
export type AppRoutesDeps = { sql: SQL; auth: Auth; frontend: HTMLBundle | Response };

export function appRoutes({ sql, auth, frontend }: AppRoutesDeps) {
  return {
    "/api/auth/*": (req: Request) => auth.handler(req),

    ...apiRoutes({ sql, auth }),

    // Bun resolves routes by specificity rather than by declaration order, so `/ws` wins against
    // the `"/*"` below wherever it is written. It is kept above the wildcard for the reader, not
    // for the router (ADR-0006).
    ...socketRoutes(auth),

    /**
     * Every HTML path serves the bundle, deep links included, and none of them creates an
     * Account. The client asks for its own session once the app boots (ADR-0003) — a server that
     * minted one per page load gave a bookmarked `/lists/abc` no Account at all, since only the
     * exact `/` went through the handler that did it.
     */
    "/*": frontend,
  };
}
