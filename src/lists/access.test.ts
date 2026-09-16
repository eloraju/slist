import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runMigrations } from "../db/migrate";
import { createTestDatabase, type TestDatabase } from "../db/test-database";
import type { Account, Membership, Role } from "../lib/permissions";
import { authoriseList, listsVisibleTo } from "./access";
import { insertListWithMembership, type ListWithMemberships } from "./queries";

/**
 * The index endpoint's visibility is `can()`'s decision, not the `where` clause's. These tests
 * hand the gate candidates the query has no business returning, because the day a Role appears
 * that does not hold `list:read`, the SQL and `can()` stop agreeing — and `can()` must win.
 */
const actor: Account = { id: "account-actor" };
const other: Account = { id: "account-other" };

function candidate(id: string, ...memberships: Membership[]): ListWithMemberships {
  return { list: { id, name: id, createdAt: "2026-01-01T00:00:00.000Z" }, memberships };
}

function membership(account: Account, listId: string, role: Role): Membership {
  return { accountId: account.id, listId, role };
}

describe("listsVisibleTo", () => {
  test("keeps a List the Account owns", () => {
    const lists = listsVisibleTo(actor, [candidate("list-1", membership(actor, "list-1", "owner"))]);

    expect(lists.map((list) => list.id)).toEqual(["list-1"]);
  });

  test("keeps a List the Account edits", () => {
    const lists = listsVisibleTo(actor, [candidate("list-1", membership(actor, "list-1", "editor"))]);

    expect(lists.map((list) => list.id)).toEqual(["list-1"]);
  });

  test("drops a candidate the Account has no Membership on, whatever the query thought", () => {
    const lists = listsVisibleTo(actor, [candidate("list-1", membership(other, "list-1", "owner"))]);

    expect(lists).toEqual([]);
  });

  test("drops a candidate with no Memberships at all", () => {
    expect(listsVisibleTo(actor, [candidate("list-1")])).toEqual([]);
  });

  test("filters a mixed set rather than passing the query's answer through", () => {
    const lists = listsVisibleTo(actor, [
      candidate("mine", membership(actor, "mine", "owner")),
      candidate("theirs", membership(other, "theirs", "owner")),
      candidate("shared", membership(actor, "shared", "editor"), membership(other, "shared", "owner")),
    ]);

    expect(lists.map((list) => list.id)).toEqual(["mine", "shared"]);
  });
});

/**
 * A missing List and one the Account has no Membership on must be indistinguishable: both are
 * `not_found`, because a 403 would confirm that the List exists (`authoriseList`'s comment,
 * CONTEXT.md "Membership"). Against a real Postgres, since the gate's answer depends on what the
 * query returns.
 */
describe("authoriseList", () => {
  const MISSING_LIST_ID = "00000000-0000-0000-0000-000000000000";

  let db: TestDatabase;
  let owner: Account;
  let stranger: Account;

  beforeAll(async () => {
    db = await createTestDatabase();
    const migrated = await runMigrations(db.sql, join(import.meta.dir, "../../migrations"));
    if (!migrated.ok) throw new Error(`test migrations failed: ${JSON.stringify(migrated.error)}`);
    owner = { id: await createAccount(db, "owner") };
    stranger = { id: await createAccount(db, "stranger") };
  });

  afterAll(async () => {
    await db.drop();
  });

  test("grants a Member the Permission its Role holds", async () => {
    const list = await insertListWithMembership(db.sql, "Groceries", owner.id, "owner");

    const authorised = await authoriseList(db.sql, owner, list.id, "list:delete");

    expect(authorised).toEqual({ ok: true, value: list });
  });

  test("tells a Member who lacks the Permission that it is forbidden", async () => {
    const list = await insertListWithMembership(db.sql, "Groceries", owner.id, "owner");
    await db.sql`update memberships set role = 'editor' where list_id = ${list.id}`;

    const authorised = await authoriseList(db.sql, owner, list.id, "list:delete");

    expect(authorised).toEqual({ ok: false, error: { kind: "forbidden", permission: "list:delete" } });
  });

  test("reports a List the Account cannot see and one that does not exist identically", async () => {
    const invisible = await insertListWithMembership(db.sql, "Theirs", owner.id, "owner");

    const unseen = await authoriseList(db.sql, stranger, invisible.id, "list:read");
    const missing = await authoriseList(db.sql, stranger, MISSING_LIST_ID, "list:read");

    expect(unseen).toEqual({ ok: false, error: { kind: "not_found" } });
    expect(missing).toEqual(unseen);
  });

  test("reports a List with no Memberships as not found rather than as missing data", async () => {
    const ownerless = await insertListWithMembership(db.sql, "Ownerless", owner.id, "owner");
    await db.sql`delete from memberships where list_id = ${ownerless.id}`;

    const authorised = await authoriseList(db.sql, owner, ownerless.id, "list:read");

    expect(authorised).toEqual({ ok: false, error: { kind: "not_found" } });
  });
});

/** Memberships reference Better Auth's `user` table, so a Membership needs a row there first. */
async function createAccount(db: TestDatabase, id: string): Promise<string> {
  await db.sql`
    insert into "user" (id, name, email, "emailVerified", "updatedAt")
    values (${id}, ${id}, ${`${id}@example.test`}, false, now())
  `;
  return id;
}
