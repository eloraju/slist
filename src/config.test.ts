import { expect, test } from "bun:test";
import { loadConfig, usesSecureCookies, websocketUrl } from "./config";

const env = { PUBLIC_URL: "https://lists.example.com", DATABASE_URL: "postgres://x/y" };

test("reads the public URL and database URL from the environment", () => {
  const config = loadConfig(env);

  expect(config.publicUrl.origin).toBe("https://lists.example.com");
  expect(config.databaseUrl).toBe("postgres://x/y");
});

test("refuses to start without a PUBLIC_URL", () => {
  expect(() => loadConfig({ DATABASE_URL: "postgres://x/y" })).toThrow(/PUBLIC_URL is required/);
});

test("cookies are Secure only when the public URL is https", () => {
  expect(usesSecureCookies(new URL("https://lists.example.com"))).toBe(true);
  expect(usesSecureCookies(new URL("http://192.168.1.50:3000"))).toBe(false);
});

test("the WebSocket URL follows the public URL's scheme and host, not the request's", () => {
  expect(websocketUrl(new URL("https://lists.example.com"), "/ws")).toBe("wss://lists.example.com/ws");
  expect(websocketUrl(new URL("http://192.168.1.50:3000"), "/ws")).toBe("ws://192.168.1.50:3000/ws");
});
