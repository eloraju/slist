import { SQL, serve } from "bun";
import { join } from "node:path";
import index from "./index.html";
import { loadConfig } from "./config";
import { runMigrations } from "./db/migrate";
import { createAuth, type Auth } from "./auth/auth";
import { resolveSigningSecret } from "./auth/signing-secret";
import { fromPromise } from "./lib/result";
import { apiRoutes } from "./api/routes";

const config = loadConfig();

// One pool for the application and for Better Auth (ADR-0007).
const sql = new SQL(config.databaseUrl);

await migrateOrExit();
const auth = createAuth({ sql, secret: await signingSecretOrExit(), publicUrl: config.publicUrl });

const server = serve({
  port: config.port,
  routes: {
    "/api/auth/*": (req) => auth.handler(req),

    // The bundled frontend. `/` goes through a handler instead so a first-time visitor leaves
    // with a session cookie (ADR-0003), and a handler cannot return an HTMLBundle.
    "/__shell": index,
    "/": (req) => serveAppShell(req),
    "/*": index,

    ...apiRoutes({ sql, auth }),
  },

  development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
});

console.log(`🚀 slist listening on ${server.url}, public URL ${config.publicUrl.origin}`);

/**
 * Migrations complete before the server binds its port, so a pulled image never serves requests
 * against a half-upgraded schema (ADR-0008). A failure here is not a Result a caller can handle:
 * the process has nothing useful left to do.
 */
async function migrateOrExit(): Promise<void> {
  const applied = await runMigrations(sql, join(import.meta.dir, "../migrations"));
  if (!applied.ok) {
    console.error("Migration failed, refusing to start:", applied.error);
    process.exit(1);
  }
  console.log(applied.value.length > 0 ? `Applied migrations: ${applied.value.join(", ")}` : "Schema up to date");
}

async function signingSecretOrExit(): Promise<string> {
  const secret = await resolveSigningSecret(sql, config.authSecret);
  if (!secret.ok) {
    console.error("Could not resolve the auth signing secret:", secret.error);
    process.exit(1);
  }
  return secret.value;
}

/**
 * Serves the frontend, creating an Anonymous Account for a visitor who has no session yet
 * (ADR-0003). The page comes from this server's own `/__shell` route over loopback rather than
 * off disk, so the bundler stays the one thing that knows how to build it — a route handler
 * cannot return an HTMLBundle, which is why the bundle needs a route of its own.
 */
async function serveAppShell(req: Request): Promise<Response> {
  const shell = await fetch(new URL("/__shell", server.url));
  const cookies = await sessionCookiesFor(req, auth);
  if (cookies.length === 0) return shell;

  const response = new Response(shell.body, shell);
  for (const cookie of cookies) response.headers.append("set-cookie", cookie);
  return response;
}

/** The cookies a visitor still needs: none if they already have a session. */
async function sessionCookiesFor(req: Request, auth: Auth): Promise<string[]> {
  const existing = await fromPromise(auth.api.getSession({ headers: req.headers }), (cause) => cause);
  if (existing.ok && existing.value !== null) return [];

  // `returnHeaders` hands back the Set-Cookie Better Auth would have written; its types do not
  // model that overload, hence the cast.
  const created = await fromPromise(
    auth.api.signInAnonymous({ headers: req.headers, returnHeaders: true } as never) as Promise<{ headers: Headers }>,
    (cause) => cause,
  );
  if (!created.ok) {
    // A visitor who cannot get an Account still gets the page; the frontend will retry.
    console.error("Anonymous sign-in failed:", created.error);
    return [];
  }
  return created.value.headers.getSetCookie();
}
