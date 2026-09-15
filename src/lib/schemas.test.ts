import { describe, expect, test } from "bun:test";
import type { z } from "zod";

import {
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_UNIT_LENGTH,
  clearCheckedItemsSchema,
  createItemSchema,
  createListSchema,
  setItemCheckedSchema,
  uncheckAllItemsSchema,
  updateItemSchema,
  updateListSchema,
} from "./schemas";

function accept<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);

  expect(result.success).toBe(true);
  if (!result.success) throw new Error("unreachable");
  return result.data;
}

function reject<T>(schema: z.ZodType<T>, input: unknown): void {
  expect(schema.safeParse(input).success).toBe(false);
}

const SURFACE: { name: string; schema: z.ZodType<unknown>; valid: unknown }[] = [
  { name: "createListSchema", schema: createListSchema, valid: { name: "Groceries" } },
  { name: "updateListSchema", schema: updateListSchema, valid: { name: "Groceries" } },
  { name: "createItemSchema", schema: createItemSchema, valid: { name: "Milk" } },
  { name: "updateItemSchema", schema: updateItemSchema, valid: { name: "Milk" } },
  { name: "setItemCheckedSchema", schema: setItemCheckedSchema, valid: { checked: true } },
  { name: "clearCheckedItemsSchema", schema: clearCheckedItemsSchema, valid: {} },
  { name: "uncheckAllItemsSchema", schema: uncheckAllItemsSchema, valid: {} },
];

describe("the REST surface, every schema", () => {
  for (const { name, schema, valid } of SURFACE) {
    test(`${name} accepts its minimal valid payload`, () => {
      accept(schema, valid);
    });

    test(`${name} rejects a position — Items have no inherent order`, () => {
      reject(schema, { ...(valid as object), position: 1 });
    });

    test(`${name} rejects an unknown key`, () => {
      reject(schema, { ...(valid as object), sortOrder: "asc" });
    });

    test(`${name} rejects a payload that is not an object`, () => {
      reject(schema, null);
      reject(schema, undefined);
      reject(schema, "name");
      reject(schema, 1);
      reject(schema, []);
    });
  }
});

describe("createListSchema", () => {
  test("accepts a named List", () => {
    expect(accept(createListSchema, { name: "Groceries" })).toEqual({ name: "Groceries" });
  });

  test("trims the name", () => {
    expect(accept(createListSchema, { name: "  Groceries  " })).toEqual({ name: "Groceries" });
  });

  test("accepts a name at the maximum length", () => {
    const name = "a".repeat(MAX_NAME_LENGTH);

    expect(accept(createListSchema, { name })).toEqual({ name });
  });

  test("rejects a missing name", () => {
    reject(createListSchema, {});
  });

  test("rejects a name that is not a string", () => {
    reject(createListSchema, { name: 1 });
    reject(createListSchema, { name: null });
    reject(createListSchema, { name: ["Groceries"] });
  });

  test("rejects an empty name", () => {
    reject(createListSchema, { name: "" });
  });

  test("rejects a whitespace-only name", () => {
    reject(createListSchema, { name: "   " });
    reject(createListSchema, { name: "\t\n" });
  });

  test("rejects a name over the maximum length", () => {
    reject(createListSchema, { name: "a".repeat(MAX_NAME_LENGTH + 1) });
  });
});

describe("updateListSchema", () => {
  test("accepts a new name", () => {
    expect(accept(updateListSchema, { name: "Weekly shop" })).toEqual({ name: "Weekly shop" });
  });

  test("trims the name", () => {
    expect(accept(updateListSchema, { name: " Weekly shop " })).toEqual({ name: "Weekly shop" });
  });

  test("rejects a missing name", () => {
    reject(updateListSchema, {});
  });

  test("rejects an empty or whitespace-only name", () => {
    reject(updateListSchema, { name: "" });
    reject(updateListSchema, { name: "  " });
  });
});

describe("createItemSchema", () => {
  test("accepts a name alone", () => {
    expect(accept(createItemSchema, { name: "Milk" })).toEqual({ name: "Milk" });
  });

  test("accepts a numeric quantity with a unit", () => {
    expect(accept(createItemSchema, { name: "Milk", quantity: 2, unit: "l" })).toEqual({
      name: "Milk",
      quantity: 2,
      unit: "l",
    });
  });

  test("accepts a quantity without a unit", () => {
    expect(accept(createItemSchema, { name: "Apples", quantity: 3 })).toEqual({
      name: "Apples",
      quantity: 3,
    });
  });

  test("accepts a fractional quantity", () => {
    expect(accept(createItemSchema, { name: "Mince", quantity: 0.5, unit: "kg" })).toEqual({
      name: "Mince",
      quantity: 0.5,
      unit: "kg",
    });
  });

  test("accepts a free-text note", () => {
    expect(accept(createItemSchema, { name: "Milk", note: "the oat one" })).toEqual({
      name: "Milk",
      note: "the oat one",
    });
  });

  test("trims the name, the unit and the note", () => {
    expect(
      accept(createItemSchema, {
        name: "  Milk  ",
        quantity: 2,
        unit: "  l  ",
        note: "  the oat one  ",
      }),
    ).toEqual({ name: "Milk", quantity: 2, unit: "l", note: "the oat one" });
  });

  test("accepts a note at the maximum length", () => {
    const note = "a".repeat(MAX_NOTE_LENGTH);

    expect(accept(createItemSchema, { name: "Milk", note })).toEqual({ name: "Milk", note });
  });

  test("rejects a missing name", () => {
    reject(createItemSchema, { quantity: 2, unit: "l" });
  });

  test("rejects an empty or whitespace-only name", () => {
    reject(createItemSchema, { name: "" });
    reject(createItemSchema, { name: "   " });
  });

  test("rejects a name over the maximum length", () => {
    reject(createItemSchema, { name: "a".repeat(MAX_NAME_LENGTH + 1) });
  });

  test("rejects a zero quantity", () => {
    reject(createItemSchema, { name: "Milk", quantity: 0, unit: "l" });
  });

  test("rejects a negative quantity", () => {
    reject(createItemSchema, { name: "Milk", quantity: -1, unit: "l" });
  });

  test("rejects a quantity that is not a finite number", () => {
    reject(createItemSchema, { name: "Milk", quantity: Number.NaN });
    reject(createItemSchema, { name: "Milk", quantity: Number.POSITIVE_INFINITY });
    reject(createItemSchema, { name: "Milk", quantity: "2" });
    reject(createItemSchema, { name: "Milk", quantity: null });
  });

  test("rejects a unit without a quantity — a unit measures nothing on its own", () => {
    reject(createItemSchema, { name: "Mince", unit: "kg" });
  });

  test("rejects a unit over the maximum length", () => {
    reject(createItemSchema, {
      name: "Milk",
      quantity: 2,
      unit: "a".repeat(MAX_UNIT_LENGTH + 1),
    });
  });

  test("rejects a unit that is not a string", () => {
    reject(createItemSchema, { name: "Milk", quantity: 2, unit: 1 });
    reject(createItemSchema, { name: "Milk", quantity: 2, unit: true });
  });

  test("rejects a note that is not a string, or is over the maximum length", () => {
    reject(createItemSchema, { name: "Milk", note: 1 });
    reject(createItemSchema, { name: "Milk", note: true });
    reject(createItemSchema, { name: "Milk", note: "a".repeat(MAX_NOTE_LENGTH + 1) });
  });

  test("rejects a Checked state — a new Item is never Checked", () => {
    reject(createItemSchema, { name: "Milk", checked: false });
    reject(createItemSchema, { name: "Milk", checked: true });
  });

  test("rejects a client-chosen id", () => {
    reject(createItemSchema, { name: "Milk", id: "item-1" });
  });
});

describe("updateItemSchema", () => {
  test("accepts a new name alone", () => {
    expect(accept(updateItemSchema, { name: "Oat milk" })).toEqual({ name: "Oat milk" });
  });

  test("accepts a quantity with a unit", () => {
    expect(accept(updateItemSchema, { quantity: 2, unit: "l" })).toEqual({ quantity: 2, unit: "l" });
  });

  test("accepts a fractional quantity", () => {
    expect(accept(updateItemSchema, { quantity: 1.5, unit: "kg" })).toEqual({
      quantity: 1.5,
      unit: "kg",
    });
  });

  test("accepts a note alone", () => {
    expect(accept(updateItemSchema, { note: "ripe ones" })).toEqual({ note: "ripe ones" });
  });

  test("accepts null to clear the note", () => {
    expect(accept(updateItemSchema, { note: null })).toEqual({ note: null });
  });

  test("accepts null to clear the quantity and the unit together", () => {
    expect(accept(updateItemSchema, { quantity: null, unit: null })).toEqual({
      quantity: null,
      unit: null,
    });
  });

  test("accepts clearing the quantity alone", () => {
    expect(accept(updateItemSchema, { quantity: null })).toEqual({ quantity: null });
  });

  test("accepts clearing the unit while keeping a quantity", () => {
    expect(accept(updateItemSchema, { quantity: 3, unit: null })).toEqual({
      quantity: 3,
      unit: null,
    });
  });

  test("accepts every edited field at once", () => {
    expect(accept(updateItemSchema, { name: "Mince", quantity: 0.5, unit: "kg", note: "lean" })).toEqual({
      name: "Mince",
      quantity: 0.5,
      unit: "kg",
      note: "lean",
    });
  });

  test("trims the name, the unit and the note", () => {
    expect(accept(updateItemSchema, { name: " Mince ", quantity: 1, unit: " kg " })).toEqual({
      name: "Mince",
      quantity: 1,
      unit: "kg",
    });
  });

  test("rejects an empty payload — an update must change something", () => {
    reject(updateItemSchema, {});
  });

  test("rejects a unit without a quantity in the same payload", () => {
    reject(updateItemSchema, { unit: "kg" });
    reject(updateItemSchema, { name: "Mince", unit: "kg" });
  });

  test("rejects setting a unit while clearing the quantity", () => {
    reject(updateItemSchema, { quantity: null, unit: "kg" });
  });

  test("rejects clearing the name — an Item always has one", () => {
    reject(updateItemSchema, { name: null });
    reject(updateItemSchema, { name: "" });
    reject(updateItemSchema, { name: "   " });
  });

  test("rejects a zero, negative or non-finite quantity", () => {
    reject(updateItemSchema, { quantity: 0, unit: "l" });
    reject(updateItemSchema, { quantity: -2, unit: "l" });
    reject(updateItemSchema, { quantity: Number.NaN });
    reject(updateItemSchema, { quantity: "2", unit: "l" });
  });

  test("rejects a unit over the maximum length", () => {
    reject(updateItemSchema, { quantity: 1, unit: "a".repeat(MAX_UNIT_LENGTH + 1) });
  });

  test("rejects a note over the maximum length", () => {
    reject(updateItemSchema, { note: "a".repeat(MAX_NOTE_LENGTH + 1) });
  });

  test("rejects a Checked state — toggling Checked is its own endpoint", () => {
    reject(updateItemSchema, { checked: true });
    reject(updateItemSchema, { name: "Milk", checked: false });
  });
});

/**
 * "Empty means no note": the UI clears a note by emptying the text input and
 * saving, which is what a text input naturally sends, so an empty or
 * whitespace-only note is accepted and normalised rather than rejected. The
 * property that matters is that exactly one representation of "no note"
 * reaches the database, so the display and sort code never handles two.
 */
describe("createItemSchema, an empty note means no note", () => {
  test("normalises an empty note to absent", () => {
    const parsed = accept(createItemSchema, { name: "Milk", note: "" });

    expect(Object.hasOwn(parsed, "note")).toBe(false);
    expect(parsed).toEqual({ name: "Milk" });
  });

  test("normalises a whitespace-only note to absent", () => {
    for (const note of ["   ", "\t\n"]) {
      const parsed = accept(createItemSchema, { name: "Milk", note });

      expect(Object.hasOwn(parsed, "note")).toBe(false);
      expect(parsed).toEqual({ name: "Milk" });
    }
  });

  test("normalising the note does not disturb the other fields", () => {
    const parsed = accept(createItemSchema, { name: "Mince", quantity: 0.5, unit: "kg", note: "  " });

    expect(Object.hasOwn(parsed, "note")).toBe(false);
    expect(parsed).toEqual({ name: "Mince", quantity: 0.5, unit: "kg" });
  });

  test("every spelling of no note parses to exactly one representation", () => {
    const spellings = [
      { name: "Milk" },
      { name: "Milk", note: "" },
      { name: "Milk", note: "   " },
      { name: "Milk", note: "\t\n" },
    ];

    const parsed = spellings.map((input) => accept(createItemSchema, input));
    const representations = new Set(parsed.map((result) => JSON.stringify(result)));

    for (const result of parsed) {
      expect(Object.keys(result).sort()).toEqual(["name"]);
    }
    expect(representations.size).toBe(1);
  });
});

describe("updateItemSchema, an empty note means no note", () => {
  test("normalises an empty note to a cleared note", () => {
    const parsed = accept(updateItemSchema, { note: "" });

    expect(parsed.note).toBe(null);
    expect(parsed).toEqual({ note: null });
  });

  test("normalises a whitespace-only note to a cleared note", () => {
    for (const note of ["   ", "\t\n"]) {
      expect(accept(updateItemSchema, { note }).note).toBe(null);
    }
  });

  test("an emptied note and an explicit null are the same instruction", () => {
    const viaEmpty = accept(updateItemSchema, { note: "" });
    const viaWhitespace = accept(updateItemSchema, { note: "   " });
    const viaNull = accept(updateItemSchema, { note: null });

    expect(viaEmpty).toEqual(viaNull);
    expect(viaWhitespace).toEqual(viaNull);
    expect(Object.keys(viaEmpty).sort()).toEqual(Object.keys(viaNull).sort());
  });

  test("clearing the note alongside other edits is still one payload", () => {
    const parsed = accept(updateItemSchema, { name: "Oat milk", note: "" });

    expect(parsed).toEqual({ name: "Oat milk", note: null });
  });

  test("an emptied note on its own still counts as a change", () => {
    expect(accept(updateItemSchema, { note: "   " })).toEqual({ note: null });
  });

  test("every spelling of no note parses to exactly one representation", () => {
    const spellings = [{ note: null }, { note: "" }, { note: "   " }, { note: "\t\n" }];

    const parsed = spellings.map((input) => accept(updateItemSchema, input));
    const representations = new Set(parsed.map((result) => JSON.stringify(result)));

    expect(representations.size).toBe(1);
    expect([...representations]).toEqual(['{"note":null}']);
  });
});

describe("setItemCheckedSchema", () => {
  test("accepts Checked", () => {
    expect(accept(setItemCheckedSchema, { checked: true })).toEqual({ checked: true });
  });

  test("accepts un-Checked", () => {
    expect(accept(setItemCheckedSchema, { checked: false })).toEqual({ checked: false });
  });

  test("rejects a missing Checked state", () => {
    reject(setItemCheckedSchema, {});
  });

  test("rejects a Checked state that is not a boolean", () => {
    reject(setItemCheckedSchema, { checked: "true" });
    reject(setItemCheckedSchema, { checked: 1 });
    reject(setItemCheckedSchema, { checked: null });
  });

  test("rejects anything else alongside the Checked state", () => {
    reject(setItemCheckedSchema, { checked: true, name: "Milk" });
  });
});

describe("the bulk actions", () => {
  test("clearing Checked Items takes an empty body", () => {
    expect(accept(clearCheckedItemsSchema, {})).toEqual({});
  });

  test("un-Checking every Item takes an empty body", () => {
    expect(accept(uncheckAllItemsSchema, {})).toEqual({});
  });

  test("neither takes a list of Items to act on — the action is the whole List", () => {
    reject(clearCheckedItemsSchema, { itemIds: ["item-1"] });
    reject(uncheckAllItemsSchema, { itemIds: ["item-1"] });
  });
});
