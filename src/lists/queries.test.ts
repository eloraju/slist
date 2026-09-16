import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SQL } from "bun";
import { join } from "node:path";
import { runMigrations } from "../db/migrate";
import { createTestDatabase, type TestDatabase } from "../db/test-database";
import { deleteListById, insertListWithMembership, selectListWithMemberships } from "./queries";

/**
 * Real Postgres, real migrations (CONVENTIONS.md, "Tests"): nothing about the database is stood
 * in for here. The counter below wraps a real `SQL` and forwards every statement to it; it
 * observes how many round trips a query function takes, it does not answer anything itself.
 */
let db: TestDatabase;
let member: string;
let stranger: string;

beforeAll(async () => {
  db = await createTestDatabase();
  const migrated = await runMigrations(db.sql, join(import.meta.dir, "../../migrations"));
  if (!migrated.ok) throw new Error(`test migrations failed: ${JSON.stringify(migrated.error)}`);
  member = await createAccount("member");
  stranger = await createAccount("stranger");
});

afterAll(async () => {
  await db.drop();
});

/** Memberships reference Better Auth's `user` table, so a Membership needs a row there first. */
async function createAccount(id: string): Promise<string> {
  await db.sql`
    insert into "user" (id, name, email, "emailVerified", "updatedAt")
    values (${id}, ${id}, ${`${id}@example.test`}, false, now())
  `;
  return id;
}

type CountingSql = { sql: SQL; roundTrips: () => number };

/**
 * A pass-through in front of the real connection that counts the statements sent through it.
 * Bun's `SQL` is itself the tagged-template function, so forwarding is one call.
 */
function countingSql(sql: SQL): CountingSql {
  let count = 0;
  const counted = (strings: TemplateStringsArray, ...values: unknown[]): unknown => {
    count += 1;
    return (sql as unknown as (s: TemplateStringsArray, ...v: unknown[]) => unknown)(strings, ...values);
  };

  return { sql: counted as unknown as SQL, roundTrips: () => count };
}

const MISSING_LIST_ID = "00000000-0000-0000-0000-000000000000";

describe("selectListWithMemberships", () => {
  test("returns the List with its Memberships", async () => {
    const created = await insertListWithMembership(db.sql, "Groceries", member, "owner");

    const found = await selectListWithMemberships(db.sql, created.id);

    expect(found?.list).toEqual(created);
    expect(found?.memberships).toEqual([{ listId: created.id, accountId: member, role: "owner" }]);
  });

  test("returns every Membership on the List", async () => {
    const created = await insertListWithMembership(db.sql, "Shared", member, "owner");
    await db.sql`insert into memberships (list_id, account_id, role) values (${created.id}, ${stranger}, 'editor')`;

    const found = await selectListWithMemberships(db.sql, created.id);

    expect(found?.memberships).toHaveLength(2);
    expect(found?.memberships.map((membership) => membership.accountId).sort()).toEqual([member, stranger].sort());
  });

  test("a List with no Memberships is still a List, not a missing one", async () => {
    const created = await insertListWithMembership(db.sql, "Ownerless", member, "owner");
    await db.sql`delete from memberships where list_id = ${created.id}`;

    const found = await selectListWithMemberships(db.sql, created.id);

    expect(found?.list).toEqual(created);
    expect(found?.memberships).toEqual([]);
  });

  test("returns undefined for a List that does not exist", async () => {
    expect(await selectListWithMemberships(db.sql, MISSING_LIST_ID)).toBeUndefined();
  });

  /**
   * The point of issue #11: `authoriseList` answers `not_found` for a missing List and for one
   * the Account cannot see, and the two answers must cost the same. Different round-trip counts
   * are the timing channel that tells the two apart.
   */
  test("costs the same number of round trips whether or not the List exists", async () => {
    const created = await insertListWithMembership(db.sql, "Invisible", member, "owner");

    const missing = countingSql(db.sql);
    await selectListWithMemberships(missing.sql, MISSING_LIST_ID);

    const existing = countingSql(db.sql);
    await selectListWithMemberships(existing.sql, created.id);

    expect(existing.roundTrips()).toBe(missing.roundTrips());
  });
});

describe("deleteListById", () => {
  test("returns the Memberships it removed, which nothing can be asked for afterwards", async () => {
    const created = await insertListWithMembership(db.sql, "Shared", member, "owner");
    await db.sql`insert into memberships (list_id, account_id, role) values (${created.id}, ${stranger}, 'editor')`;

    const removed = await deleteListById(db.sql, created.id);

    expect(removed.map((membership) => membership.accountId).sort()).toEqual([member, stranger].sort());
    expect(await selectListWithMemberships(db.sql, created.id)).toBeUndefined();
    expect(await db.sql`select 1 from memberships where list_id = ${created.id}`).toHaveLength(0);
  });

  test("deleting a List that is already gone removes nothing and says so", async () => {
    expect(await deleteListById(db.sql, MISSING_LIST_ID)).toEqual([]);
  });
});
