import type { SQL } from "bun";
import { selectItemsForList, type ItemRecord } from "../items/queries";
import type { AppError } from "../lib/errors";
import type { Account, Membership, Role } from "../lib/permissions";
import { err, ok, type Result } from "../lib/result";
import type { CreateListInput, UpdateListInput } from "../lib/schemas";
import { authoriseList, listsVisibleTo } from "./access";
import {
  deleteListById,
  insertListWithMembership,
  selectListCandidatesFor,
  updateListName,
  type ListRecord,
} from "./queries";

/** The decisions about Lists. Every one of them starts by asking `can()` (ADR-0005). */
export type ListWithItems = { list: ListRecord; items: ItemRecord[] };

/**
 * The creator of a List starts as its Owner (CONTEXT.md, "Owner") — a rule about who holds what,
 * so it is decided here rather than spelled into the insert.
 */
const CREATOR_ROLE: Role = "owner";

export async function createList(
  sql: SQL,
  actor: Account,
  input: CreateListInput,
): Promise<Result<ListRecord, AppError>> {
  return ok(await insertListWithMembership(sql, input.name, actor.id, CREATOR_ROLE));
}

/** The gate runs here, not in the `where` clause: `can()` decides what the Account may see. */
export async function listListsFor(sql: SQL, actor: Account): Promise<Result<ListRecord[], AppError>> {
  return ok(listsVisibleTo(actor, await selectListCandidatesFor(sql, actor.id)));
}

export async function readList(sql: SQL, actor: Account, listId: string): Promise<Result<ListWithItems, AppError>> {
  const list = await authoriseList(sql, actor, listId, "list:read");
  if (!list.ok) return list;

  return ok({ list: list.value, items: await selectItemsForList(sql, listId) });
}

/** Renaming is not an Owner-only action: an Editor edits the List as well as its Items. */
export async function renameList(
  sql: SQL,
  actor: Account,
  listId: string,
  input: UpdateListInput,
): Promise<Result<ListRecord, AppError>> {
  const list = await authoriseList(sql, actor, listId, "list:update");
  if (!list.ok) return list;

  const renamed = await updateListName(sql, listId, input.name);
  // The row was there a statement ago; if it is gone now, a concurrent delete won the race and
  // the List is, correctly, not found.
  return renamed === undefined ? err({ kind: "not_found" }) : ok(renamed);
}

/**
 * The Memberships it removed are the value, not `null`: they are a true fact about what the
 * operation did, and after the cascade there is nobody left to ask who held one. The caller that
 * notifies former Members (ADR-0006) is the reason anyone wants to know, but it is not the reason
 * it is true.
 */
export async function deleteList(sql: SQL, actor: Account, listId: string): Promise<Result<Membership[], AppError>> {
  const list = await authoriseList(sql, actor, listId, "list:delete");
  if (!list.ok) return list;

  return ok(await deleteListById(sql, listId));
}
