/**
 * The pure core of access control (ADR-0005). Roles are a constant map from a
 * Role name to a set of Permissions, defined here in code and identical on
 * every installation; the Membership row stores only its `role`. `can()` is the
 * only reader of a Role in the app, so moving Roles into the database later
 * changes this file and nothing else.
 */

export const ROLES = ["owner", "editor"] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "list:read",
  "list:update",
  "list:delete",
  "membership:remove",
  "membership:promote",
  "item:create",
  "item:update",
  "item:delete",
  "item:check",
  "item:clear_checked",
  "item:uncheck_all",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** The minimum `can()` needs of an Account. Richer objects satisfy it. */
export type Account = { readonly id: string };

/** The link between an Account and a List, carrying exactly one Role. */
export type Membership = {
  readonly accountId: string;
  readonly listId: string;
  readonly role: Role;
};

/**
 * The minimum `can()` needs of a List. The Memberships are the only data that
 * answers the question, so the pure core is handed them rather than querying.
 */
export type List = {
  readonly id: string;
  readonly memberships: readonly Membership[];
};

export function can(_account: Account, _permission: Permission, _list: List): boolean {
  throw new Error("not implemented");
}
