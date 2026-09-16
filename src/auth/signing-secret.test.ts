import { afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import { createTestDatabase, type TestDatabase } from "../db/test-database";
import { runMigrations } from "../db/migrate";
import { resolveSigningSecret } from "./signing-secret";

const MIGRATIONS = join(import.meta.dir, "../../migrations");

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
  const migrated = await runMigrations(db.sql, MIGRATIONS);
  if (!migrated.ok) throw new Error(`migrations failed: ${JSON.stringify(migrated.error)}`);
});

afterEach(async () => {
  await db.drop();
});

test("uses the secret from the environment and stores nothing", async () => {
  const result = await resolveSigningSecret(db.sql, "an-operator-supplied-secret-of-ample-length");

  expect(result).toEqual({ ok: true, value: "an-operator-supplied-secret-of-ample-length" });
  const rows = await db.sql`select count(*)::int as count from app_settings where key = 'auth.signing_secret'`;
  expect(rows[0].count).toBe(0);
});

test("generates a secret on first boot and returns the same one on every later boot", async () => {
  const first = await resolveSigningSecret(db.sql, undefined);
  const second = await resolveSigningSecret(db.sql, undefined);

  expect(first.ok).toBe(true);
  if (!first.ok) throw new Error("unreachable");
  expect(first.value.length).toBeGreaterThanOrEqual(32);
  expect(second).toEqual({ ok: true, value: first.value });
});

test("an env secret never overwrites the persisted one", async () => {
  const generated = await resolveSigningSecret(db.sql, undefined);
  if (!generated.ok) throw new Error("unreachable");

  await resolveSigningSecret(db.sql, "an-env-secret-that-is-long-enough-to-pass");
  const afterEnvBoot = await resolveSigningSecret(db.sql, undefined);

  expect(afterEnvBoot).toEqual({ ok: true, value: generated.value });
});

test("two instances on a first boot agree on one secret", async () => {
  const other = new (await import("bun")).SQL(db.url);

  const [a, b] = await Promise.all([resolveSigningSecret(db.sql, undefined), resolveSigningSecret(other, undefined)]);
  await other.end();

  expect(a.ok && b.ok).toBe(true);
  expect(a).toEqual(b);
  const rows = await db.sql`select count(*)::int as count from app_settings where key = 'auth.signing_secret'`;
  expect(rows[0].count).toBe(1);
});

test("refuses to start on an AUTH_SECRET shorter than 32 characters", async () => {
  await expect(resolveSigningSecret(db.sql, "x")).rejects.toThrow(/AUTH_SECRET must be at least 32 characters/);
});
