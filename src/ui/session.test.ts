import { afterAll, beforeAll, expect, test } from "bun:test";
import { serve } from "bun";
import { createAppTestServer, type AppTestServer } from "../test-app";
import { ensureSession } from "./session";

let app: AppTestServer;

beforeAll(async () => {
  app = await createAppTestServer();
});

afterAll(async () => {
  await app.stop();
});

async function accountCount(): Promise<number> {
  const rows = await app.sql`select count(*)::int as count from "user"`;
  return rows[0].count;
}

test("a first-time visitor ends up with exactly one Anonymous Account", async () => {
  const browser = app.browser();
  const before = await accountCount();

  const session = await ensureSession(browser.fetch);

  expect(session.ok).toBe(true);
  if (!session.ok) throw new Error("unreachable");
  expect(session.value.accountId).toBeString();
  expect(await accountCount()).toBe(before + 1);
  expect(browser.cookie()).toContain("better-auth.session_token");
});

test("a reload keeps the same Account instead of minting a second", async () => {
  const browser = app.browser();
  const first = await ensureSession(browser.fetch);
  const before = await accountCount();

  // A reload is the same cookie jar arriving at a fresh page.
  const second = await ensureSession(browser.fetch);

  expect(second).toEqual(first);
  expect(await accountCount()).toBe(before);
});

test("a failed session check does not mint an Account and leaves the cookie alone", async () => {
  const browser = app.browser();
  const established = await ensureSession(browser.fetch);
  if (!established.ok) throw new Error("unreachable");
  const cookie = browser.cookie();
  const before = await accountCount();

  // Postgres blinks, a proxy hiccups: the session check fails rather than answering "no session".
  const flaky = serve({
    port: 0,
    fetch: (req) => {
      const path = new URL(req.url).pathname;
      if (path === "/api/auth/get-session") return new Response("upstream is having a moment", { status: 503 });
      return app.browser().fetch(path, { method: req.method });
    },
  });
  const throughFlakyServer = (path: string, init?: RequestInit) =>
    fetch(new URL(path, flaky.url), { ...init, headers: { ...(init?.headers as object), cookie } });

  const result = await ensureSession(throughFlakyServer);
  await flaky.stop(true);

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  // Not "no session": a transient failure that minted a new Account would strand this visitor's
  // Lists for good (ADR-0003).
  expect(result.error.kind).toBe("session_check_failed");
  expect(await accountCount()).toBe(before);
  expect(browser.cookie()).toBe(cookie);
});

test("a session check that answers with something other than a session does not mint an Account", async () => {
  // A captive portal or a proxy error page: 200, but not an answer about a session.
  const lying = serve({ port: 0, fetch: () => new Response("<html>hotel wifi</html>", { status: 200 }) });
  const before = await accountCount();

  const result = await ensureSession((path, init) => fetch(new URL(path, lying.url), init));
  await lying.stop(true);

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.error.kind).toBe("session_check_failed");
  expect(await accountCount()).toBe(before);
});

test("two bootstraps racing on one page mint one Account, not two", async () => {
  const browser = app.browser();
  const before = await accountCount();

  // React StrictMode runs effects twice in development; a retry button can do the same.
  const [a, b] = await Promise.all([ensureSession(browser.fetch), ensureSession(browser.fetch)]);

  expect(a).toEqual(b);
  expect(await accountCount()).toBe(before + 1);
});
