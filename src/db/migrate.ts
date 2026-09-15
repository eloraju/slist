import type { SQL } from "bun";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { err, ok, type Result } from "../lib/result";

/**
 * Numbered `.sql` files applied on boot, each inside a transaction, tracked in `_migrations`
 * (ADR-0007). No ORM and no generated diffs: the files are the schema, and a self-hoster whose
 * boot fails can read the file that failed.
 */
export type MigrationError =
  | { kind: "migrations_unreadable"; dir: string; cause: unknown }
  | { kind: "migration_failed"; name: string; cause: unknown }
  | { kind: "migration_changed"; name: string };

/**
 * Two app instances booting at once would otherwise both see the same migration as pending and
 * both try to apply it. A session-level advisory lock serialises them; the loser waits, then
 * finds nothing to do. The key is an arbitrary constant, shared only with other copies of slist.
 */
const MIGRATION_LOCK_KEY = 4823551076;

const CREATE_MIGRATIONS_TABLE = `
  create table if not exists _migrations (
    name text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )
`;

type MigrationFile = { name: string; sql: string; checksum: string };

export async function runMigrations(sql: SQL, dir: string): Promise<Result<string[], MigrationError>> {
  const files = await readMigrationFiles(dir);
  if (!files.ok) return files;

  const lock = await sql.reserve();
  try {
    await lock`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    // Created under the lock: concurrent `create table if not exists` for the same table can fail
    // on Postgres' own catalogue unique index rather than being a no-op.
    await lock.unsafe(CREATE_MIGRATIONS_TABLE);

    const applied = await readAppliedMigrations(lock);
    const pending = files.value.filter((file) => !applied.has(file.name));

    const unchanged = assertAppliedFilesUnchanged(files.value, applied);
    if (!unchanged.ok) return unchanged;

    const appliedNow: string[] = [];
    for (const file of pending) {
      const result = await applyMigration(sql, file);
      if (!result.ok) return result;
      appliedNow.push(file.name);
    }
    return ok(appliedNow);
  } finally {
    await lock`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    lock.release();
  }
}

async function readMigrationFiles(dir: string): Promise<Result<MigrationFile[], MigrationError>> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  } catch (cause) {
    return err({ kind: "migrations_unreadable", dir, cause });
  }

  const files: MigrationFile[] = [];
  for (const name of names) {
    const text = await Bun.file(join(dir, name)).text();
    files.push({ name, sql: text, checksum: Bun.SHA256.hash(text, "hex") });
  }
  return ok(files);
}

async function readAppliedMigrations(sql: SQL): Promise<Map<string, string>> {
  const rows = (await sql`select name, checksum from _migrations`) as { name: string; checksum: string }[];
  return new Map(rows.map((row) => [row.name, row.checksum]));
}

/**
 * An applied file that has changed on disk means the database and the repo disagree about what
 * the schema is. Refusing to boot is the only honest answer: re-running it is not safe, and
 * pretending it matches hides the drift until a much later query fails.
 */
function assertAppliedFilesUnchanged(
  files: MigrationFile[],
  applied: Map<string, string>,
): Result<null, MigrationError> {
  for (const file of files) {
    const checksum = applied.get(file.name);
    if (checksum !== undefined && checksum !== file.checksum) {
      return err({ kind: "migration_changed", name: file.name });
    }
  }
  return ok(null);
}

/**
 * The file's statements and the `_migrations` row commit together, so a migration that fails
 * half way leaves no trace and the next boot retries it from the top.
 */
async function applyMigration(sql: SQL, file: MigrationFile): Promise<Result<null, MigrationError>> {
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(file.sql);
      await tx`insert into _migrations (name, checksum) values (${file.name}, ${file.checksum})`;
    });
    return ok(null);
  } catch (cause) {
    return err({ kind: "migration_failed", name: file.name, cause });
  }
}
