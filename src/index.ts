import { SQL, serve } from "bun";
import { join } from "node:path";
import index from "./index.html";
import { loadConfig } from "./config";
import { runMigrations } from "./db/migrate";
import { createAuth } from "./auth/auth";
import { resolveSigningSecret } from "./auth/signing-secret";
import { appRoutes } from "./server-routes";
import { websocket } from "./api/socket";

const config = loadConfig();

// One pool for the application and for Better Auth (ADR-0007).
const sql = new SQL(config.databaseUrl);

await migrateOrExit();
const auth = createAuth({ sql, secret: await signingSecretOrExit(), publicUrl: config.publicUrl });

const server = serve({
  port: config.port,
  routes: appRoutes({ sql, auth, frontend: index }),
  websocket,

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
