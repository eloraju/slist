import { describe, expect, test } from "bun:test";
import type { Account, Membership, Role } from "../lib/permissions";
import { listsVisibleTo } from "./access";
import type { ListWithMemberships } from "./queries";

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
