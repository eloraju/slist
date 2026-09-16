import { afterAll, beforeAll, expect, test } from "bun:test";
import { createAppTestServer, FRONTEND_MARKER, type AppTestServer } from "./test-app";

let app: AppTestServer;

beforeAll(async () => {
  app = await createAppTestServer();
});

afterAll(async () => {
  await app.stop();
});

test("a deep link serves the frontend, so a bookmarked list opens", async () => {
  const response = await app.browser().fetch("/lists/abc");

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toStartWith("text/html");
  expect(await response.text()).toBe(FRONTEND_MARKER);
});

test("the root serves the frontend and mints nothing on its own", async () => {
  const browser = app.browser();

  const response = await browser.fetch("/");

  expect(await response.text()).toBe(FRONTEND_MARKER);
  // Serving a page is not a reason to create an Account: the client asks for one (ADR-0003).
  expect(response.headers.getSetCookie()).toEqual([]);
  const accounts = await app.sql`select count(*)::int as count from "user"`;
  expect(accounts[0].count).toBe(0);
});

test("there is no cookieless shell route left to find", async () => {
  const response = await app.browser().fetch("/__shell");

  // It serves the frontend like any other path now, rather than being a special route.
  expect(await response.text()).toBe(FRONTEND_MARKER);
});

test("the auth routes are mounted", async () => {
  const response = await app.browser().fetch("/api/auth/get-session");

  expect(response.status).toBe(200);
});

test("the API routes are still mounted", async () => {
  const response = await app.browser().fetch("/api/lists");

  expect(response.status).toBe(401);
});

test("the socket route wins against the frontend wildcard, and demands a session", async () => {
  // A plain GET is not an upgrade, so what this asserts is that `/ws` answered at all rather than
  // serving the bundle, and that it refuses an anonymous visitor. Bun resolves routes by
  // specificity and not by declaration order — verified, not assumed — so this stays green
  // wherever the route sits in the table; it is here to catch the route being dropped or
  // stopping at the session check, which is what would actually leave a client unable to connect.
  const response = await app.browser().fetch("/ws");

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthenticated" });
});
