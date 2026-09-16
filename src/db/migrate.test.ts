import { afterEach, beforeEach, expect, test } from "bun:test";
import { SQL } from "bun";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

test("a .sql entry that cannot be read comes back as a value, not a throw", async () => {
  await writeMigration("0001_first.sql", "create table widgets (id text primary key);");
  // A directory named like a migration is the reproducible stand-in for a file that is
  // unreadable, or that vanishes between the listing and the read.
  await mkdir(join(dir, "0002_unreadable.sql"));

  const result = await runMigrations(db.sql, dir);

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.error.kind).toBe("migrations_unreadable");
});

test("a failing unlock does not hide which migration failed", async () => {
  // The migration kills every other backend in this database — including the connection holding
  // the advisory lock — and then fails, so releasing the lock throws on the way out.
  await writeMigration(
    "0001_suicidal.sql",
    `select pg_terminate_backend(pid) from pg_stat_activity
       where datname = current_database() and pid <> pg_backend_pid();
     select 1 / 0;`,
  );

  const result = await runMigrations(db.sql, dir);

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.error.kind).toBe("migration_failed");
  expect((result.error as { name: string }).name).toBe("0001_suicidal.sql");
});

test("a successful run leaves the pool whole for the server that boots on it", async () => {
  // The success path is the one that matters: `src/index.ts` runs migrations and then serves the
  // whole app from this same pool (ADR-0007), so a reserved connection that never comes back
  // costs the running server a slot for the life of the process. The failure path cannot: a
  // failed run exits the process (ADR-0008, migrations complete before the server binds).
  //
  // Two connections is exactly what one run needs — one reserved for the advisory lock, one for
  // the transaction — so a stranded one leaves a slot that never returns. Reserving is bounded
  // rather than awaited outright: an exhausted pool waits forever, and a timeout reports only
  // that the test was slow.
  const pool = new SQL(db.url, { max: 2 });
  await writeMigration("0001_first.sql", "create table widgets (id text primary key);");

  const applied = await runMigrations(pool, dir);
  expect(applied).toEqual({ ok: true, value: ["0001_first.sql"] });

  const first = await pool.reserve();
  const second = await Promise.race([
    pool.reserve().then((held) => held),
    Bun.sleep(500).then(() => "pool exhausted" as const),
  ]);

  expect(second).not.toBe("pool exhausted");
  first.release();
  if (second !== "pool exhausted") second.release();
  await pool.end();
});

test("an applied migration whose file is gone stops the boot", async () => {
  await writeMigration("0001_first.sql", "create table widgets (id text primary key);");
  await runMigrations(db.sql, dir);
  await rm(join(dir, "0001_first.sql"));

  const result = await runMigrations(db.sql, dir);

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.error).toEqual({ kind: "migration_missing", name: "0001_first.sql" });
});
