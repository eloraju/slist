import type { SQL } from "bun";
import type { AppError } from "../lib/errors";
import type { Account } from "../lib/permissions";
import { err, ok, type Result } from "../lib/result";
import type { CreateItemInput, SetItemCheckedInput, UpdateItemInput } from "../lib/schemas";
import { authoriseList } from "../lists/access";
import {
  deleteCheckedItems,
  deleteItemById,
  insertItem,
  uncheckItems,
  updateItemChecked,
  updateItemFields,
  type ItemRecord,
} from "./queries";

/** The decisions about Items. The Permission for each action is named at its `authoriseList`. */
export async function addItem(
  sql: SQL,
  actor: Account,
  listId: string,
  input: CreateItemInput,
): Promise<Result<ItemRecord, AppError>> {
  const list = await authoriseList(sql, actor, listId, "item:create");
  if (!list.ok) return list;

  return ok(await insertItem(sql, listId, input));
}

export async function editItem(
  sql: SQL,
  actor: Account,
  listId: string,
  itemId: string,
  input: UpdateItemInput,
): Promise<Result<ItemRecord, AppError>> {
  const list = await authoriseList(sql, actor, listId, "item:update");
  if (!list.ok) return list;

  const edited = await updateItemFields(sql, listId, itemId, withoutAnOrphanedUnit(input));
  return edited === undefined ? err({ kind: "not_found" }) : ok(edited);
}

export async function removeItem(
  sql: SQL,
  actor: Account,
  listId: string,
  itemId: string,
): Promise<Result<null, AppError>> {
  const list = await authoriseList(sql, actor, listId, "item:delete");
  if (!list.ok) return list;

  const removed = await deleteItemById(sql, listId, itemId);
  return removed ? ok(null) : err({ kind: "not_found" });
}

/**
 * Checking is its own action, and a Checked Item stays on its List: nothing here removes it
 * (CONTEXT.md, "Checked").
 */
export async function setItemChecked(
  sql: SQL,
  actor: Account,
  listId: string,
  itemId: string,
  input: SetItemCheckedInput,
): Promise<Result<ItemRecord, AppError>> {
  const list = await authoriseList(sql, actor, listId, "item:check");
  if (!list.ok) return list;

  const checked = await updateItemChecked(sql, listId, itemId, input.checked);
  return checked === undefined ? err({ kind: "not_found" }) : ok(checked);
}

export async function clearCheckedItems(
  sql: SQL,
  actor: Account,
  listId: string,
): Promise<Result<{ removed: number }, AppError>> {
  const list = await authoriseList(sql, actor, listId, "item:clear_checked");
  if (!list.ok) return list;

  return ok({ removed: await deleteCheckedItems(sql, listId) });
}

export async function uncheckAllItems(
  sql: SQL,
  actor: Account,
  listId: string,
): Promise<Result<{ unchecked: number }, AppError>> {
  const list = await authoriseList(sql, actor, listId, "item:uncheck_all");
  if (!list.ok) return list;

  return ok({ unchecked: await uncheckItems(sql, listId) });
}

/**
 * Clearing the quantity clears the unit with it. The payload may legally say only
 * `{ quantity: null }`, but the Item would be left measuring "kg" of nothing — a state the Zod
 * schemas and the database both refuse for every other route into it.
 */
function withoutAnOrphanedUnit(input: UpdateItemInput): UpdateItemInput {
  return input.quantity === null ? { ...input, unit: null } : input;
}
