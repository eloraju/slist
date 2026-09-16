import type { SQL } from "bun";
import { randomBytes } from "node:crypto";
import { err, ok, type Result } from "../lib/result";

/**
 * The zero-config path has to be real: no secret in the environment must not mean a crash on
 * first run (ADR-0008). The generated secret lives next to the session rows it protects, so it
 * leaks nothing a database compromise would not already give up.
 */
export type SigningSecretError = { kind: "signing_secret_unavailable"; cause: unknown };

const SETTING_KEY = "auth.signing_secret";

/** The generated fallback is `randomBytes(32)`; a supplied secret is held to the same bar. */
const MINIMUM_SECRET_LENGTH = 32;

export async function resolveSigningSecret(
  sql: SQL,
  envSecret: string | undefined,
): Promise<Result<string, SigningSecretError>> {
  if (envSecret !== undefined && envSecret !== "") {
    // An operator mistake at boot, not an outcome the caller can act on, so it crashes rather than
    // joining SigningSecretError — that variant stays for the database failure it covers.
    if (envSecret.length < MINIMUM_SECRET_LENGTH) {
      throw new Error(
        `AUTH_SECRET must be at least ${MINIMUM_SECRET_LENGTH} characters. Got ${envSecret.length}. Leave it unset to have one generated on first boot.`,
      );
    }
    return ok(envSecret);
  }

  try {
    return ok(await generateAndPersistSecret(sql));
  } catch (cause) {
    return err({ kind: "signing_secret_unavailable", cause });
  }
}

/**
 * `on conflict do nothing` plus a read-back makes this safe for two instances on a first boot:
 * both may generate a candidate, exactly one row is written, and both return that row — so the
 * secret is stable across restarts and across instances.
 */
async function generateAndPersistSecret(sql: SQL): Promise<string> {
  const candidate = randomBytes(32).toString("base64url");
  await sql`insert into app_settings (key, value) values (${SETTING_KEY}, ${candidate}) on conflict (key) do nothing`;
  const rows = (await sql`select value from app_settings where key = ${SETTING_KEY}`) as { value: string }[];
  const stored = rows[0]?.value;
  if (stored === undefined) throw new Error("app_settings row for the signing secret disappeared mid-boot");
  return stored;
}
