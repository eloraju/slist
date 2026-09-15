import type { SQL } from "bun";
import type { AppError } from "../lib/errors";
import { can, type Account, type Permission } from "../lib/permissions";
import { err, ok, type Result } from "../lib/result";
import { selectListWithMemberships, type ListRecord, type ListWithMemberships } from "./queries";

/**
 * The one gate every List and Item action passes through. `can()` is the only capability check in
 * the app (ADR-0005), so it is called here rather than in each domain function, and the
 * Memberships are loaded alongside the List because they are the only data that answers it.
 *
 * A List an Account has no Membership on is reported as missing, not as forbidden: it cannot see
 * the List at all (CONTEXT.md, "Membership"), and a 403 would confirm that it exists.
 */
export async function authoriseList(
  sql: SQL,
  actor: Account,
  listId: string,
  permission: Permission,
): Promise<Result<ListRecord, AppError>> {
  const found = await selectListWithMemberships(sql, listId);
  if (found === undefined) return err({ kind: "not_found" });

  const list = { id: found.list.id, memberships: found.memberships };
  if (!can(actor, "list:read", list)) return err({ kind: "not_found" });
  if (!can(actor, permission, list)) return err({ kind: "forbidden", permission });

  return ok(found.list);
}

/**
 * The index endpoint's gate. The query scopes the candidates — fetching every List in the
 * database to filter in memory would be absurd — but it does not get to decide: `can()` does,
 * here, the same function every other endpoint asks. Today every Membership implies `list:read`
 * and the two agree; the day a Role appears that does not, this endpoint changes with all the
 * others instead of quietly outliving them (ADR-0005).
 */
export function listsVisibleTo(actor: Account, candidates: ListWithMemberships[]): ListRecord[] {
  return candidates
    .filter(({ list, memberships }) => can(actor, "list:read", { id: list.id, memberships }))
    .map(({ list }) => list);
}
