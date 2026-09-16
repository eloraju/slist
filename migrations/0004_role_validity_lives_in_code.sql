-- Role validity belongs to the `Role` type in `src/lib/permissions.ts`, not to the schema
-- (ADR-0005, amended 2026-09-16). 0003 declared a check constraint listing the Roles that existed
-- then, which contradicted the ADR's promise that adding a Role is adding a key in code and needs
-- no migration — the constraint made it need exactly this one.
--
-- Nothing is lost by dropping it: `insertListWithMembership` only ever takes a `Role`, and every
-- Membership read back is narrowed to a `Role` before `can()` sees it, so an unrecognised value
-- cannot enter through the app and cannot leave the query layer if it is put there by hand.
alter table memberships drop constraint memberships_role_check;
