import { serve } from "bun";
import { join } from "node:path";
import { createAuth } from "../auth/auth";
import { runMigrations } from "../db/migrate";
import { createTestDatabase, type TestDatabase } from "../db/test-database";
import { parseMessage, type Message } from "../lib/wire";
import { apiRoutes } from "./routes";
import { socketRoutes, websocket } from "./socket";

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
  /** An open socket for that Account, collecting what the server pushes to it (ADR-0006). */
  openSocket: (actor: TestActor) => Promise<TestSocket>;
  stop: () => Promise<void>;
};

export type TestActor = { cookie: string; accountId: string };

export type TestSocket = {
  /** Every message that has arrived, in arrival order, for the assertions that expect none. */
  received: Message[];
  /**
   * The next message not yet taken, rejecting once the bound passes. A socket test that slept a
   * fixed number of milliseconds instead would be slow when it passed and flaky when it did not.
   */
  next: (timeoutMs?: number) => Promise<Message>;
  close: () => void;
};

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
  // `websocket` is a sibling of `routes`, not one of them, so the route table alone cannot carry
  // it and every server that mounts `/ws` has to pass it here as well.
  const server = serve({
    port: 0,
    routes: { ...apiRoutes({ sql: db.sql, auth }), ...socketRoutes(auth) },
    websocket,
  });
  const url = server.url.toString().replace(/\/$/, "");

  return {
    url,
    sql: db.sql,
    signIn: () => signInAnonymously(auth),
    openSocket: (actor) => openSocket(url, actor),
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

/**
 * A real WebSocket client against the real server (CONVENTIONS.md, "Tests"). Bun's client accepts
 * `headers`, a non-standard extension, which is the only way a test can present the session on an
 * upgrade; a browser sends the cookie by itself.
 */
async function openSocket(url: string, actor: TestActor): Promise<TestSocket> {
  const received: Message[] = [];
  const waiting: (() => void)[] = [];
  let taken = 0;

  // `lib.dom` is loaded for the browser bundle, so the DOM's two-argument constructor wins over
  // Bun's; the options are widened here rather than the lib narrowed for everyone.
  const options: Bun.WebSocketOptions = { headers: { cookie: actor.cookie } };
  const socket = new WebSocket(`${url.replace(/^http/, "ws")}/ws`, options as unknown as string[]);
  socket.addEventListener("message", (event) => {
    const parsed = parseMessage(event.data);
    // The server is the only writer on this socket, so an unparseable payload is a bug in it
    // rather than an outcome a test should assert around.
    if (parsed === undefined) throw new Error(`the server pushed an unparseable payload: ${String(event.data)}`);
    received.push(parsed);
    waiting.shift()?.();
  });

  // Nothing may be published before the subscription exists, or the test races the server.
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("the test socket failed to open")));
  });

  return {
    received,
    close: () => socket.close(),
    next: (timeoutMs = 2000) =>
      new Promise<Message>((resolve, reject) => {
        const take = (): boolean => {
          const message = received[taken];
          if (message === undefined) return false;
          taken += 1;
          resolve(message);
          return true;
        };
        if (take()) return;

        const timer = setTimeout(() => reject(new Error(`no socket message arrived within ${timeoutMs}ms`)), timeoutMs);
        waiting.push(() => {
          clearTimeout(timer);
          take();
        });
      }),
  };
}
