import { z } from "zod";

/**
 * The pure core of request validation: the Zod schemas for the REST surface.
 * Every schema is strict — an unknown key is a client bug, and rejecting it is
 * what guarantees no schema ever admits a `position`, since Items have no
 * inherent order and the server never orders them.
 */

export const MAX_NAME_LENGTH = 200;
export const MAX_UNIT_LENGTH = 32;
export const MAX_NOTE_LENGTH = 2000;

export type CreateListInput = { name: string };

export type UpdateListInput = { name: string };

export type CreateItemInput = {
  name: string;
  quantity?: number;
  unit?: string;
  note?: string;
};

/**
 * A partial update. `null` clears an optional field; omitting it leaves the
 * field alone. A `unit` may not be set without a `quantity` in the same
 * payload, because a unit with nothing to measure is not a quantity.
 */
export type UpdateItemInput = {
  name?: string;
  quantity?: number | null;
  unit?: string | null;
  note?: string | null;
};

export type SetItemCheckedInput = { checked: boolean };

export type ClearCheckedItemsInput = Record<string, never>;

export type UncheckAllItemsInput = Record<string, never>;

const notImplemented = <T>(): z.ZodType<T> =>
  z.any().transform((): T => {
    throw new Error("not implemented");
  }) as unknown as z.ZodType<T>;

export const createListSchema = notImplemented<CreateListInput>();

export const updateListSchema = notImplemented<UpdateListInput>();

export const createItemSchema = notImplemented<CreateItemInput>();

export const updateItemSchema = notImplemented<UpdateItemInput>();

export const setItemCheckedSchema = notImplemented<SetItemCheckedInput>();

export const clearCheckedItemsSchema = notImplemented<ClearCheckedItemsInput>();

export const uncheckAllItemsSchema = notImplemented<UncheckAllItemsInput>();
