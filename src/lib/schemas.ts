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

/** Trimmed on the way in, so a name is never stored with edge whitespace. */
const listName = z.string().trim().min(1).max(MAX_NAME_LENGTH);

const itemName = z.string().trim().min(1).max(MAX_NAME_LENGTH);

const quantity = z.number().positive().finite();

const unit = z.string().trim().min(1).max(MAX_UNIT_LENGTH);

const note = z.string().trim().max(MAX_NOTE_LENGTH);

/** A unit with nothing to measure is not a quantity (CONTEXT.md, "Item"). */
function measuresAQuantity(input: { quantity?: number | null; unit?: string | null }): boolean {
  if (input.unit === undefined || input.unit === null) return true;

  return typeof input.quantity === "number";
}

const UNIT_NEEDS_A_QUANTITY = { error: "a unit needs a quantity to measure", path: ["unit"] };

function changesSomething(input: object): boolean {
  return Object.keys(input).length > 0;
}

export const createListSchema: z.ZodType<CreateListInput> = z.strictObject({ name: listName });

export const updateListSchema: z.ZodType<UpdateListInput> = z.strictObject({ name: listName });

export const createItemSchema: z.ZodType<CreateItemInput> = z
  .strictObject({
    name: itemName,
    quantity: quantity.optional(),
    unit: unit.optional(),
    note: note.optional(),
  })
  .refine(measuresAQuantity, UNIT_NEEDS_A_QUANTITY);

export const updateItemSchema: z.ZodType<UpdateItemInput> = z
  .strictObject({
    name: itemName.optional(),
    quantity: quantity.nullable().optional(),
    unit: unit.nullable().optional(),
    note: note.nullable().optional(),
  })
  .refine(changesSomething, { error: "an update must change something" })
  .refine(measuresAQuantity, UNIT_NEEDS_A_QUANTITY);

export const setItemCheckedSchema: z.ZodType<SetItemCheckedInput> = z.strictObject({ checked: z.boolean() });

export const clearCheckedItemsSchema: z.ZodType<ClearCheckedItemsInput> = z.strictObject({});

export const uncheckAllItemsSchema: z.ZodType<UncheckAllItemsInput> = z.strictObject({});
