import { describe, expect, test } from "bun:test";
import { byCheckedThenName, byName, type Named, type SortableItem } from "./sort";

function names(items: SortableItem[]): string[] {
  return [...items].sort(byCheckedThenName).map((item) => item.name);
}

const item = (name: string, checked = false): SortableItem => ({ name, checked });

describe("byCheckedThenName", () => {
  test("puts un-Checked Items before Checked ones", () => {
    expect(names([item("Bread", true), item("Milk")])).toEqual(["Milk", "Bread"]);
  });

  test("sorts alphabetically within each group", () => {
    expect(names([item("Milk"), item("Apples"), item("Bread", true), item("Ale", true)])).toEqual([
      "Apples",
      "Milk",
      "Ale",
      "Bread",
    ]);
  });

  test("ignores case", () => {
    expect(names([item("milk"), item("Apples")])).toEqual(["Apples", "milk"]);
  });

  test("is stable for two Items with the same name and state", () => {
    expect(byCheckedThenName(item("Milk"), item("Milk"))).toBe(0);
  });
});

describe("byName", () => {
  function sorted(names: string[]): string[] {
    const lists: Named[] = names.map((name) => ({ name }));
    return [...lists].sort(byName).map((list) => list.name);
  }

  test("orders alphabetically", () => {
    expect(sorted(["Weekly shop", "Barbecue", "Milk run"])).toEqual(["Barbecue", "Milk run", "Weekly shop"]);
  });

  test("ignores case, so a lowercase List is not exiled to the end", () => {
    expect(sorted(["weekly shop", "Barbecue"])).toEqual(["Barbecue", "weekly shop"]);
  });

  test("is stable for two identical names", () => {
    expect(byName({ name: "Groceries" }, { name: "groceries" })).toBe(0);
  });
});
