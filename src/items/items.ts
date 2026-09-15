import type { SQL } from "bun";
import type { AppError } from "../lib/errors";
import type { Account } from "../lib/permissions";
import { err, type Result } from "../lib/result";
import type { ItemView } from "../lists/lists";
import type { CreateItemInput, SetItemCheckedInput, UpdateItemInput } from "../lib/schemas";

const notImplemented = <T>(): Result<T, AppError> => err({ kind: "not_found" });

export async function addItem(
  _sql: SQL,
  _actor: Account,
  _listId: string,
  _input: CreateItemInput,
): Promise<Result<ItemView, AppError>> {
  return notImplemented();
}

export async function editItem(
  _sql: SQL,
  _actor: Account,
  _listId: string,
  _itemId: string,
  _input: UpdateItemInput,
): Promise<Result<ItemView, AppError>> {
  return notImplemented();
}

export async function removeItem(
  _sql: SQL,
  _actor: Account,
  _listId: string,
  _itemId: string,
): Promise<Result<null, AppError>> {
  return notImplemented();
}

export async function setItemChecked(
  _sql: SQL,
  _actor: Account,
  _listId: string,
  _itemId: string,
  _input: SetItemCheckedInput,
): Promise<Result<ItemView, AppError>> {
  return notImplemented();
}

export async function clearCheckedItems(
  _sql: SQL,
  _actor: Account,
  _listId: string,
): Promise<Result<{ removed: number }, AppError>> {
  return notImplemented();
}

export async function uncheckAllItems(
  _sql: SQL,
  _actor: Account,
  _listId: string,
): Promise<Result<{ unchecked: number }, AppError>> {
  return notImplemented();
}
