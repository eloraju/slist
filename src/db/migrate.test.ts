import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDatabase, type TestDatabase } from "./test-database";
import { runMigrations } from "./migrate";

let db: TestDatabase;
let dir: string;

beforeEach(async () => {
  db = await createTestDatabase();
  dir = await mkdtemp(join(tmpdir(), "slist-migrations-"));
});

afterEach(async () => {
  await db.drop();
});

async function writeMigration(name: string, sql: string): Promise<void> {
  await writeFile(join(dir, name), sql);
}

async function appliedNames(database: TestDatabase): Promise<string[]> {
  const rows = await database.sql`select name from _migrations order by name`;
  return rows.map((row: { name: string }) => row.name);
}

test("applies numbered migrations in order and records them", async () => {
  await writeMigration("0001_first.sql", "create table widgets (id text primary key);");
  await writeMigration("0002_second.sql", "alter table widgets add column label text;");

  const result = await runMigrations(db.sql, dir);

  expect(result).toEqual({ ok: true, value: ["0001_first.sql", "0002_second.sql"] });
  expect(await appliedNames(db)).toEqual(["0001_first.sql", "0002_second.sql"]);
  const columns =
    await db.sql`select column_name from information_schema.columns where table_name = 'widgets' order by 1`;
  expect(columns.map((c: { column_name: string }) => c.column_name)).toEqual(["id", "label"]);
});

test("a second boot applies nothing", async () => {
  await writeMigration("0001_first.sql", "create table widgets (id text primary key);");
  await runMigrations(db.sql, dir);

  const second = await runMigrations(db.sql, dir);

  expect(second).toEqual({ ok: true, value: [] });
  expect(await appliedNames(db)).toEqual(["0001_first.sql"]);
});

test("a failing migration rolls back every statement in that file", async () => {
  await writeMigration("0001_first.sql", "create table widgets (id text primary key);");
  await writeMigration(
    "0002_broken.sql",
    "create table gadgets (id text primary key); create table gadgets (id text primary key);",
  );

  const result = await runMigrations(db.sql, dir);

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.error.kind).toBe("migration_failed");
  expect(await appliedNames(db)).toEqual(["0001_first.sql"]);
  const gadgets = await db.sql`select to_regclass('public.gadgets') as table`;
  expect(gadgets[0].table).toBeNull();
});

test("an already-applied migration that changed on disk stops the boot", async () => {
  await writeMigration("0001_first.sql", "create table widgets (id text primary key);");
  await runMigrations(db.sql, dir);
  await writeMigration("0001_first.sql", "create table widgets (id text primary key, sneaky text);");

  const result = await runMigrations(db.sql, dir);

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.error).toEqual({ kind: "migration_changed", name: "0001_first.sql" });
});

test("two instances booting at once apply each migration exactly once", async () => {
  await writeMigration("0001_first.sql", "create table widgets (id text primary key);");
  await writeMigration("0002_second.sql", "create table gadgets (id text primary key);");
  const other = new (await import("bun")).SQL(db.url);

  const [a, b] = await Promise.all([runMigrations(db.sql, dir), runMigrations(other, dir)]);
  await other.end();

  expect(a.ok && b.ok).toBe(true);
  const appliedByBoth = [...(a.ok ? a.value : []), ...(b.ok ? b.value : [])].sort();
  expect(appliedByBoth).toEqual(["0001_first.sql", "0002_second.sql"]);
  expect(await appliedNames(db)).toEqual(["0001_first.sql", "0002_second.sql"]);
});
