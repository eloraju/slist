import { describe, expect, test } from "bun:test";
import { itemFieldsFrom, type ItemDraft } from "./item-draft";

function draft(overrides: Partial<ItemDraft> = {}): ItemDraft {
  return { name: "Milk", quantity: "", unit: "", note: "", ...overrides };
}

function fieldsOf(overrides: Partial<ItemDraft> = {}) {
  const result = itemFieldsFrom(draft(overrides));

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  return result.value;
}

describe("itemFieldsFrom", () => {
  test("trims the name, the unit and the note", () => {
    expect(fieldsOf({ name: "  Mince  ", quantity: " 0.5 ", unit: "  kg  ", note: "  lean  " })).toEqual({
      name: "Mince",
      quantity: 0.5,
      unit: "kg",
      note: "lean",
    });
  });

  test("an empty unit or note is nothing at all", () => {
    expect(fieldsOf({ unit: "   ", note: "" })).toEqual({ name: "Milk", quantity: null, unit: null, note: null });
  });

  test("an empty quantity is no quantity", () => {
    expect(fieldsOf({ quantity: "  " }).quantity).toBe(null);
  });

  test("clearing the quantity clears the unit with it", () => {
    expect(fieldsOf({ quantity: "", unit: "kg" })).toMatchObject({ quantity: null, unit: null });
  });

  test("keeps the unit when there is a quantity to measure", () => {
    expect(fieldsOf({ quantity: "2", unit: "l" })).toMatchObject({ quantity: 2, unit: "l" });
  });

  test("a quantity that is not a number is reported, not swallowed", () => {
    for (const quantity of ["abc", "2kg", "1,5", "--2"]) {
      const result = itemFieldsFrom(draft({ quantity, unit: "kg" }));

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.error).toEqual({ kind: "quantity_not_a_number", value: quantity });
    }
  });

  test("a garbage quantity never quietly clears the fields it came with", () => {
    expect(itemFieldsFrom(draft({ quantity: "2kg", unit: "kg" })).ok).toBe(false);
  });
});
