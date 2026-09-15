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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // A missing or malformed PUBLIC_URL is not something a caller can recover from: the app cannot
  // build a correct cookie or link without it, so this throws rather than returning a Result.
  const publicUrl = new URL(requireEnv(env, "PUBLIC_URL"));
  return {
    publicUrl,
    databaseUrl: requireEnv(env, "DATABASE_URL"),
    authSecret: env.AUTH_SECRET,
    port: Number(env.PORT ?? 3000),
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

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required. Copy .env.example to .env and fill it in.`);
  }
  return value;
}
