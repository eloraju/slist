/**
 * `PUBLIC_URL` is the only origin source in the app (ADR-0008): the session cookie's `Secure`
 * flag, the WebSocket URL and Invite link origins all derive from it. Nothing reads the request
 * `Host` header — behind Caddy or Traefik it is a lie, and trusting it is how self-hosted apps
 * hand people `http://localhost:3000/invite/...`.
 */
export type AppConfig = {
  publicUrl: URL;
  databaseUrl: string;
  /** Set only by an operator who wants to control the secret; otherwise it is generated on first boot. */
  authSecret: string | undefined;
  port: number;
};

const DEFAULT_PORT = 3000;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // A missing or malformed PUBLIC_URL is not something a caller can recover from: the app cannot
  // build a correct cookie or link without it, so this throws rather than returning a Result.
  return {
    publicUrl: parsePublicUrl(requireEnv(env, "PUBLIC_URL")),
    databaseUrl: requireEnv(env, "DATABASE_URL"),
    authSecret: env.AUTH_SECRET,
    port: parsePort(env.PORT),
  };
}

export function usesSecureCookies(publicUrl: URL): boolean {
  return publicUrl.protocol === "https:";
}

export function websocketUrl(publicUrl: URL, path: string): string {
  const url = new URL(path, publicUrl);
  url.protocol = publicUrl.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

/**
 * A path prefix is refused rather than honoured: supporting one means threading it through Better
 * Auth's basePath, the WebSocket URL, the `/*` route table, the frontend's asset base and the
 * Invite links of Phases 2-3, which is far more work than the sub-path deploy is worth today
 * (issue #14). Refusing it turns a silent breakage — no session, no error — into a boot failure.
 */
function parsePublicUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // `new URL` says only "Invalid URL", which leaves the operator hunting for which variable it
    // came from — the same friendliness requireEnv gives a missing one.
    throw new Error(
      `PUBLIC_URL must be a full URL including the scheme, e.g. https://lists.example.com. Got: ${value}`,
    );
  }
  if (url.pathname !== "/") {
    throw new Error(
      `PUBLIC_URL must be the root of its origin: slist cannot be served from a path prefix. Got: ${value}`,
    );
  }
  return url;
}

/**
 * `Number("300O")` is `NaN`, which `Bun.serve` reads as "pick a port for me" — the app then binds
 * somewhere the operator did not ask for and docker-compose's port mapping points at nothing.
 */
function parsePort(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a whole number between 1 and 65535. Got: ${value}`);
  }
  return port;
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required. Copy .env.example to .env and fill it in.`);
  }
  return value;
}
