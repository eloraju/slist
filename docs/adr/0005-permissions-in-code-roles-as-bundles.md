# Permissions live in code; Roles are bundles of them

Every capability check goes through one function, `can(account, permission,
list)`. Nothing else in the app reads a Role. Roles are a constant map from a
Role name to a set of Permission strings, defined in code and identical on every
installation; the Membership row stores only a `role` column.

Adding a Permission is adding a string. Adding a Role is adding a key. Neither
needs a migration or a UI. Because `can()` is the only reader, moving Roles into
the database later means changing one function's implementation rather than
touching call sites — we build the seam now, not the system.

## Consequences

A Permission is strictly boolean, answered at the moment of the action.
Workflows like "may delete, but an Owner must confirm" are **not** Permissions
and must not be modelled as one: they are a permitted action that enters a
pending state, and they need their own machinery. Keeping `can()` binary stops
that third answer leaking into every mutation in the app.

## Amendment, 2026-09-16: the schema does not get a say (#8)

Migration 0003 gave `memberships.role` a `check (role in ('owner', 'editor'))`, which
contradicted this ADR: it made adding a Role need a migration, the one cost the decision above
exists to avoid. Migration 0004 drops it, and the ADR's claim stands unqualified.

Role validity is therefore enforced **only** in code: by the `Role` type in
`src/lib/permissions.ts` and by the functions that take one. `insertListWithMembership` accepts a
`Role`, never a string, so no Role the code does not know can be written through the app. On the
way back out, `toMembership` narrows the row's text with `parseRole` and throws on a value the
code does not know, because a cast there would hand `can()` a Role that is not one. Those two
functions are the whole guard; a Role crossing any future boundary — an Invite payload, an HTTP
body — narrows the same way.

The trade-off accepted: the database will now hold a Role written by hand, or by a newer image,
that this code cannot resolve. That surfaces as a named error at the read, not as a silently
wrong permission answer.

## Considered options

- **Roles and permissions as database rows**, operator-editable: three more
  tables, an admin UI nobody may use, and a stale-seeded-roles problem every
  time a new image adds a Permission — unpleasant to inflict on self-hosters.
- **Direct per-Member grants, no Roles**: a checkbox grid for a UI, and no way
  to change what "Editor" means across every List at once.
