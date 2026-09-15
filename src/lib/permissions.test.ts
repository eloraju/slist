import { describe, expect, test } from "bun:test";

import type { Account, List, Membership, Permission } from "./permissions";
import { PERMISSIONS, can } from "./permissions";

const owner: Account = { id: "account-owner" };
const secondOwner: Account = { id: "account-second-owner" };
const editor: Account = { id: "account-editor" };
const stranger: Account = { id: "account-stranger" };

const LIST_ID = "list-1";
const OTHER_LIST_ID = "list-2";

const ITEM_PERMISSIONS = PERMISSIONS.filter((permission) => permission.startsWith("item:"));

/** CONTEXT.md: the Permissions no Role but Owner holds. */
const OWNER_ONLY_PERMISSIONS: Permission[] = ["list:delete", "membership:remove", "membership:promote"];

function membership(account: Account, role: Membership["role"], listId = LIST_ID): Membership {
  return { accountId: account.id, listId, role };
}

function listWith(...memberships: Membership[]): List {
  return { id: LIST_ID, memberships };
}

describe("can, Owner", () => {
  test("holds every Permission", () => {
    const list = listWith(membership(owner, "owner"));

    for (const permission of PERMISSIONS) {
      expect(can(owner, permission, list)).toBe(true);
    }
  });

  test("holds the Permissions no other Role holds", () => {
    const list = listWith(membership(owner, "owner"));

    for (const permission of OWNER_ONLY_PERMISSIONS) {
      expect(can(owner, permission, list)).toBe(true);
    }
  });

  test("a List may have several Owners, and each holds every Permission", () => {
    const list = listWith(membership(owner, "owner"), membership(secondOwner, "owner"));

    for (const permission of PERMISSIONS) {
      expect(can(secondOwner, permission, list)).toBe(true);
    }
  });
});

describe("can, Editor", () => {
  test("holds every Item Permission", () => {
    const list = listWith(membership(editor, "editor"));

    expect(ITEM_PERMISSIONS.length).toBeGreaterThan(0);
    for (const permission of ITEM_PERMISSIONS) {
      expect(can(editor, permission, list)).toBe(true);
    }
  });

  test("may read and rename the List", () => {
    const list = listWith(membership(editor, "editor"));

    expect(can(editor, "list:read", list)).toBe(true);
    expect(can(editor, "list:update", list)).toBe(true);
  });

  test("may not delete the List, remove a Member, or promote a Member to Owner", () => {
    const list = listWith(membership(editor, "editor"));

    for (const permission of OWNER_ONLY_PERMISSIONS) {
      expect(can(editor, permission, list)).toBe(false);
    }
  });

  test("differs from Owner in exactly the Owner-only Permissions", () => {
    const ownerList = listWith(membership(owner, "owner"));
    const editorList = listWith(membership(editor, "editor"));

    const ownerOnly = PERMISSIONS.filter(
      (permission) => can(owner, permission, ownerList) && !can(editor, permission, editorList),
    );

    expect([...ownerOnly].sort()).toEqual([...OWNER_ONLY_PERMISSIONS].sort());
  });
});

describe("can, no Membership", () => {
  test("an Account with no Membership on a List cannot see it at all", () => {
    const list = listWith(membership(owner, "owner"), membership(editor, "editor"));

    for (const permission of PERMISSIONS) {
      expect(can(stranger, permission, list)).toBe(false);
    }
  });

  test("a List with no Memberships grants nothing to anyone", () => {
    const list = listWith();

    for (const permission of PERMISSIONS) {
      expect(can(owner, permission, list)).toBe(false);
    }
  });

  test("a Membership on another List grants nothing on this one", () => {
    const list = listWith(membership(owner, "owner", OTHER_LIST_ID));

    for (const permission of PERMISSIONS) {
      expect(can(owner, permission, list)).toBe(false);
    }
  });

  test("another Account's Owner Membership grants nothing to a stranger", () => {
    const list = listWith(membership(owner, "owner"));

    expect(can(stranger, "list:read", list)).toBe(false);
    expect(can(stranger, "item:create", list)).toBe(false);
  });
});

describe("can, Ownerless List (ADR-0004)", () => {
  test("Editors keep every Item Permission", () => {
    const list = listWith(membership(editor, "editor"));

    for (const permission of ITEM_PERMISSIONS) {
      expect(can(editor, permission, list)).toBe(true);
    }
  });

  test("Editors keep reading and renaming the List", () => {
    const list = listWith(membership(editor, "editor"));

    expect(can(editor, "list:read", list)).toBe(true);
    expect(can(editor, "list:update", list)).toBe(true);
  });

  test("the Owner-only Permissions are unavailable to every Member", () => {
    const list = listWith(
      membership(editor, "editor"),
      membership(secondOwner, "editor"),
      membership(stranger, "editor"),
    );

    for (const account of [editor, secondOwner, stranger]) {
      for (const permission of OWNER_ONLY_PERMISSIONS) {
        expect(can(account, permission, list)).toBe(false);
      }
    }
  });
});

describe("can, several Memberships on one List", () => {
  test("each Account is judged by its own Membership", () => {
    const list = listWith(membership(owner, "owner"), membership(editor, "editor"), membership(secondOwner, "owner"));

    expect(can(owner, "list:delete", list)).toBe(true);
    expect(can(secondOwner, "list:delete", list)).toBe(true);
    expect(can(editor, "list:delete", list)).toBe(false);
    expect(can(editor, "item:check", list)).toBe(true);
    expect(can(stranger, "item:check", list)).toBe(false);
  });

  test("an Account's own Role decides, not the strongest Role present", () => {
    const list = listWith(membership(owner, "owner"), membership(editor, "editor"));

    expect(can(editor, "membership:promote", list)).toBe(false);
    expect(can(editor, "membership:remove", list)).toBe(false);
  });
});
