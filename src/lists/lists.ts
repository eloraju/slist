import type { SQL } from "bun";
import type { AppError } from "../lib/errors";
import type { Account } from "../lib/permissions";
import { err, type Result } from "../lib/result";
import type { CreateListInput, UpdateListInput } from "../lib/schemas";

export type ListSummary = { id: string; name: string; createdAt: string };

export type ItemView = {
  id: string;
  listId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  checked: boolean;
};

export type ListWithItems = { list: ListSummary; items: ItemView[] };

const notImplemented = <T>(): Result<T, AppError> => err({ kind: "not_found" });

export async function createList(
  _sql: SQL,
  _actor: Account,
  _input: CreateListInput,
): Promise<Result<ListSummary, AppError>> {
  return notImplemented();
}

export async function listListsFor(_sql: SQL, _actor: Account): Promise<Result<ListSummary[], AppError>> {
  return notImplemented();
}

export async function readList(_sql: SQL, _actor: Account, _listId: string): Promise<Result<ListWithItems, AppError>> {
  return notImplemented();
}

export async function renameList(
  _sql: SQL,
  _actor: Account,
  _listId: string,
  _input: UpdateListInput,
): Promise<Result<ListSummary, AppError>> {
  return notImplemented();
}

export async function deleteList(_sql: SQL, _actor: Account, _listId: string): Promise<Result<null, AppError>> {
  return notImplemented();
}
