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

/**
 * An optional free-text field arrives as whatever a text input sends. Its length is not checked
 * here: emptiness is collapsed first (see the pipeline below), so a blank field is never measured
 * against a limit it was never trying to reach.
 */
const optionalText = z.string().nullable();

/** A unit with nothing to measure is not a quantity (CONTEXT.md, "Item"). */
function measuresAQuantity(input: { quantity?: number | null; unit?: string | null }): boolean {
  if (input.unit === undefined || input.unit === null) return true;

  return typeof input.quantity === "number";
}

const UNIT_NEEDS_A_QUANTITY = { error: "a unit needs a quantity to measure", path: ["unit"] };

function changesSomething(input: object): boolean {
  return Object.keys(input).length > 0;
}

/**
 * Every spelling of "nothing here" — absent, `""`, whitespace, `null` — becomes one
 * representation. The UI clears a note or a unit by emptying its input and saving, which is what
 * a text input naturally sends, so emptiness is normalised rather than rejected; the reward is
 * that display, sort and SQL only ever meet one shape of "no note".
 */
function textOrAbsent(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";

  return trimmed === "" ? undefined : trimmed;
}

function withinTextLimits(input: { unit?: string | null; note?: string | null }): boolean {
  return (input.unit ?? "").length <= MAX_UNIT_LENGTH && (input.note ?? "").length <= MAX_NOTE_LENGTH;
}

const TEXT_TOO_LONG = { error: "a unit or a note is over its maximum length", path: ["note"] };

export const createListSchema: z.ZodType<CreateListInput> = z.strictObject({ name: listName });

export const updateListSchema: z.ZodType<UpdateListInput> = z.strictObject({ name: listName });

/**
 * The order of the pipeline is the contract: trim, collapse emptiness, then check the coupling,
 * then check the lengths. Checking the coupling first would make "rename this Item and clear its
 * unit" impossible from the obvious client behaviour, because an emptied unit input would still
 * look like a unit with nothing to measure.
 */
export const createItemSchema: z.ZodType<CreateItemInput> = z
  .strictObject({
    name: itemName,
    quantity: quantity.optional(),
    unit: optionalText.optional(),
    note: optionalText.optional(),
  })
  .transform(normaliseCreateItem)
  .refine(measuresAQuantity, UNIT_NEEDS_A_QUANTITY)
  .refine(withinTextLimits, TEXT_TOO_LONG);

/** On create, "nothing" is the key being absent: there is no field yet to clear. */
function normaliseCreateItem(input: {
  name: string;
  quantity?: number;
  unit?: string | null;
  note?: string | null;
}): CreateItemInput {
  const normalised: CreateItemInput = { name: input.name };
  if (input.quantity !== undefined) normalised.quantity = input.quantity;

  const unit = textOrAbsent(input.unit);
  if (unit !== undefined) normalised.unit = unit;

  const note = textOrAbsent(input.note);
  if (note !== undefined) normalised.note = note;

  return normalised;
}

export const updateItemSchema: z.ZodType<UpdateItemInput> = z
  .strictObject({
    name: itemName.optional(),
    quantity: quantity.nullable().optional(),
    unit: optionalText.optional(),
    note: optionalText.optional(),
  })
  .transform(normaliseUpdateItem)
  .refine(changesSomething, { error: "an update must change something" })
  .refine(measuresAQuantity, UNIT_NEEDS_A_QUANTITY)
  .refine(withinTextLimits, TEXT_TOO_LONG);

/**
 * On update, "nothing" is the key present and `null`: that is the instruction to clear a field,
 * and it must stay distinguishable from a key the payload never mentioned, which is the
 * instruction to leave the field alone.
 */
function normaliseUpdateItem(input: {
  name?: string;
  quantity?: number | null;
  unit?: string | null;
  note?: string | null;
}): UpdateItemInput {
  const normalised: UpdateItemInput = {};
  if (input.name !== undefined) normalised.name = input.name;
  if ("quantity" in input) normalised.quantity = input.quantity ?? null;
  if ("unit" in input) normalised.unit = textOrAbsent(input.unit) ?? null;
  if ("note" in input) normalised.note = textOrAbsent(input.note) ?? null;

  return normalised;
}

export const setItemCheckedSchema: z.ZodType<SetItemCheckedInput> = z.strictObject({ checked: z.boolean() });

export const clearCheckedItemsSchema: z.ZodType<ClearCheckedItemsInput> = z.strictObject({});

export const uncheckAllItemsSchema: z.ZodType<UncheckAllItemsInput> = z.strictObject({});
