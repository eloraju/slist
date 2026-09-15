import { describe, expect, test } from "bun:test";
import { byCheckedThenName, type SortableItem } from "./sort";

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
