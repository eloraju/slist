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

test("reads the port from the environment", () => {
  expect(loadConfig({ ...env, PORT: "8080" }).port).toBe(8080);
});

test("defaults the port to 3000 when unset", () => {
  expect(loadConfig(env).port).toBe(3000);
});

test("refuses to start on a non-numeric PORT, naming the variable and the value", () => {
  expect(() => loadConfig({ ...env, PORT: "300O" })).toThrow(/PORT must be a whole number.*300O/);
});

test("refuses to start on an out-of-range PORT", () => {
  expect(() => loadConfig({ ...env, PORT: "70000" })).toThrow(/PORT must be a whole number.*70000/);
  expect(() => loadConfig({ ...env, PORT: "-1" })).toThrow(/PORT must be a whole number.*-1/);
  expect(() => loadConfig({ ...env, PORT: "0" })).toThrow(/PORT must be a whole number.*0/);
});

test("refuses to start on a PUBLIC_URL with no scheme, naming the variable and the value", () => {
  expect(() => loadConfig({ ...env, PUBLIC_URL: "lists.example.com" })).toThrow(
    /PUBLIC_URL must be a full URL.*lists\.example\.com/,
  );
});
