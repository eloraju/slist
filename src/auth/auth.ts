import type { SQL } from "bun";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { PostgresJSDialect } from "kysely-postgres-js";
import { usesSecureCookies } from "../config";

export type Auth = ReturnType<typeof createAuth>;

export type AuthOptions = {
  sql: SQL;
  secret: string;
  publicUrl: URL;
};

/**
 * Better Auth runs on the application's single `Bun.sql` pool through `kysely-postgres-js`, which
 * accepts a `Bun.SQL` where it expects a postgres.js client (ADR-0007). Verified in the Phase 0
 * spike: postgres.js stays out of the dependency tree despite the dialect's peer dependency.
 *
 * Better Auth checks the database schema on first use and caches the answer, so migrations must
 * have finished before this instance handles a request — they do: they run before the server binds.
 */
export function createAuth({ sql, secret, publicUrl }: AuthOptions) {
  return betterAuth({
    database: {
      // `Bun.SQL` and postgres.js share a tagged-template interface; the cast is the price of the
      // dialect typing its input as postgres.js.
      dialect: new PostgresJSDialect({ postgres: sql as never }),
      type: "postgres",
    },
    secret,
    baseURL: publicUrl.origin,
    trustedOrigins: [publicUrl.origin],
    advanced: {
      // Derived from PUBLIC_URL, never from the request (ADR-0008). A LAN deploy on plain HTTP
      // would drop a Secure cookie on the floor.
      useSecureCookies: usesSecureCookies(publicUrl),
    },
    // A visitor is a real Account from the first request (ADR-0003).
    plugins: [anonymous()],
  });
}
