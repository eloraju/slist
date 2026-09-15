import type { SQL } from "bun";
import { selectItemsForList, type ItemRecord } from "../items/queries";
import type { AppError } from "../lib/errors";
import type { Account } from "../lib/permissions";
import { err, ok, type Result } from "../lib/result";
import type { CreateListInput, UpdateListInput } from "../lib/schemas";
import { authoriseList } from "./access";
import { deleteListById, insertListWithOwner, selectListsForAccount, updateListName, type ListRecord } from "./queries";

/** The decisions about Lists. Every one of them starts by asking `can()` (ADR-0005). */
export type ListWithItems = { list: ListRecord; items: ItemRecord[] };

/** Creating a List makes its creator an Owner; nobody has to be granted access to their own List. */
export async function createList(
  sql: SQL,
  actor: Account,
  input: CreateListInput,
): Promise<Result<ListRecord, AppError>> {
  return ok(await insertListWithOwner(sql, input.name, actor.id));
}

export async function listListsFor(sql: SQL, actor: Account): Promise<Result<ListRecord[], AppError>> {
  return ok(await selectListsForAccount(sql, actor.id));
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

export async function deleteList(sql: SQL, actor: Account, listId: string): Promise<Result<null, AppError>> {
  const list = await authoriseList(sql, actor, listId, "list:delete");
  if (!list.ok) return list;

  await deleteListById(sql, listId);
  return ok(null);
}
