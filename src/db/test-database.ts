import { SQL } from "bun";
import { randomUUID } from "node:crypto";

/**
 * Tests run against a real Postgres (CONVENTIONS.md, "Tests"). Each test gets its own
 * database rather than a shared schema, so a migration runner under test can create and
 * drop whatever it likes without seeing another test's tables.
 *
 * `docker compose -f docker-compose.test.yml up -d` provides the server.
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://slist:slist@localhost:55433/slist_test";

export type TestDatabase = {
  url: string;
  sql: SQL;
  drop: () => Promise<void>;
};

export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `slist_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new SQL(ADMIN_URL);
  await admin.unsafe(`create database "${name}"`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const sql = new SQL(url.toString());

  return {
    url: url.toString(),
    sql,
    drop: async () => {
      await sql.end();
      const cleanup = new SQL(ADMIN_URL);
      await cleanup.unsafe(`drop database if exists "${name}" with (force)`);
      await cleanup.end();
    },
  };
}
