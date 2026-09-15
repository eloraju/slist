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

export async function resolveSigningSecret(
  sql: SQL,
  envSecret: string | undefined,
): Promise<Result<string, SigningSecretError>> {
  if (envSecret !== undefined && envSecret !== "") return ok(envSecret);

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
