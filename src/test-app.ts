import { serve } from "bun";
import { join } from "node:path";
import { createAuth } from "./auth/auth";
import { runMigrations } from "./db/migrate";
import { createTestDatabase, type TestDatabase } from "./db/test-database";
import { websocket } from "./api/socket";
import { appRoutes } from "./server-routes";

/**
 * The whole server — auth routes, API routes and the frontend route — on a real Postgres
 * (CONVENTIONS.md, "Tests"). The frontend is a plain Response rather than the HTML bundle: what
 * these tests care about is which paths serve a page, not what the bundler puts in it.
 */
export type AppTestServer = {
  url: string;
  sql: TestDatabase["sql"];
  /** A fetch that keeps cookies, like the browser the bootstrap actually runs in. */
  browser: () => Browser;
  stop: () => Promise<void>;
};

export type Browser = {
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  cookie: () => string;
  requests: string[];
};

export const FRONTEND_MARKER = "<!doctype html><title>slist test frontend</title>";

export async function createAppTestServer(): Promise<AppTestServer> {
  const db = await createTestDatabase();
  const migrated = await runMigrations(db.sql, join(import.meta.dir, "../migrations"));
  if (!migrated.ok) throw new Error(`test migrations failed: ${JSON.stringify(migrated.error)}`);

  // Plain HTTP, so the session cookie is not Secure and travels to a loopback port.
  const auth = createAuth({
    sql: db.sql,
    secret: "test-secret-not-a-real-one",
    publicUrl: new URL("http://localhost"),
  });
  const frontend = () => new Response(FRONTEND_MARKER, { headers: { "content-type": "text/html;charset=utf-8" } });
  const server = serve({ port: 0, routes: appRoutes({ sql: db.sql, auth, frontend: frontend() }), websocket });
  const url = server.url.toString().replace(/\/$/, "");

  return {
    url,
    sql: db.sql,
    browser: () => createBrowser(url),
    stop: async () => {
      await server.stop(true);
      await db.drop();
    },
  };
}

/** A cookie jar and a request log: enough of a browser to tell one visit from the next. */
function createBrowser(origin: string): Browser {
  let cookie = "";
  const requests: string[] = [];

  return {
    requests,
    cookie: () => cookie,
    fetch: async (path, init) => {
      requests.push(`${init?.method ?? "GET"} ${path}`);
      const headers = new Headers(init?.headers);
      if (cookie !== "") headers.set("cookie", cookie);
      const response = await fetch(new URL(path, origin), { ...init, headers, redirect: "manual" });
      const set = response.headers.getSetCookie();
      if (set.length > 0) cookie = set.map((value) => value.split(";")[0]).join("; ");
      return response;
    },
  };
}
