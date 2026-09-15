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

/**
 * The Role map. Owner holds every Permission; Editor holds all but the three
 * that belong to Owner alone (CONTEXT.md, "Owner"). Both bundles are spelled
 * out rather than derived from one another, so adding a Permission forces a
 * decision about Editor here instead of silently widening it.
 */
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  editor: new Set([
    "list:read",
    "list:update",
    "item:create",
    "item:update",
    "item:delete",
    "item:check",
    "item:clear_checked",
    "item:uncheck_all",
  ]),
};

/**
 * An Account is judged by its own Membership on this List and nothing else: a
 * Membership on another List is not one here, and an Ownerless List simply has
 * no holder of the Owner-only Permissions — there is no fallback (ADR-0004).
 */
function membershipOn(list: List, account: Account): Membership | undefined {
  return list.memberships.find((membership) => membership.accountId === account.id && membership.listId === list.id);
}

export function can(account: Account, permission: Permission, list: List): boolean {
  const membership = membershipOn(list, account);
  if (!membership) return false;

  return ROLE_PERMISSIONS[membership.role].has(permission);
}
