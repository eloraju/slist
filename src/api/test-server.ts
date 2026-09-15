import { serve } from "bun";
import { join } from "node:path";
import { createAuth } from "../auth/auth";
import { runMigrations } from "../db/migrate";
import { createTestDatabase, type TestDatabase } from "../db/test-database";
import { apiRoutes } from "./routes";

/**
 * A real server on a real Postgres with the real migrations and real Better Auth sessions
 * (CONVENTIONS.md, "Tests"). Nothing here is a stand-in: an integration test that signs in gets
 * an Anonymous Account the same way a browser does.
 */
export type TestServer = {
  url: string;
  sql: TestDatabase["sql"];
  /** A fresh Anonymous Account, as its cookie header and its id. */
  signIn: () => Promise<TestActor>;
  stop: () => Promise<void>;
};

export type TestActor = { cookie: string; accountId: string };

export async function createTestServer(): Promise<TestServer> {
  const db = await createTestDatabase();
  const migrated = await runMigrations(db.sql, join(import.meta.dir, "../../migrations"));
  if (!migrated.ok) throw new Error(`test migrations failed: ${JSON.stringify(migrated.error)}`);

  // Plain HTTP, so the session cookie is not Secure and travels to a loopback port.
  const auth = createAuth({
    sql: db.sql,
    secret: "test-secret-not-a-real-one",
    publicUrl: new URL("http://localhost"),
  });
  const server = serve({ port: 0, routes: apiRoutes({ sql: db.sql, auth }) });

  return {
    url: server.url.toString().replace(/\/$/, ""),
    sql: db.sql,
    signIn: () => signInAnonymously(auth),
    stop: async () => {
      await server.stop(true);
      await db.drop();
    },
  };
}

async function signInAnonymously(auth: ReturnType<typeof createAuth>): Promise<TestActor> {
  // `returnHeaders` hands back the Set-Cookie Better Auth would have written; its types do not
  // model that overload, hence the cast.
  const { headers } = (await auth.api.signInAnonymous({ returnHeaders: true } as never)) as { headers: Headers };
  const cookie = headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  if (session === null) throw new Error("anonymous sign-in produced no session");
  return { cookie, accountId: session.user.id };
}
