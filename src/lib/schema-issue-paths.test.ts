import { describe, expect, test } from "bun:test";
import { MAX_NOTE_LENGTH, MAX_UNIT_LENGTH, createItemSchema, updateItemSchema } from "./schemas";

/**
 * A rejection names the field it is about: the client shows the message next to the input the
 * person has to fix, so blaming the note for an over-long unit sends them to the wrong box.
 *
 * These live beside `schemas.test.ts` rather than inside it because that file belongs to the
 * agent that specified the schemas.
 */
function pathsOfIssues(
  schema: { safeParse: (input: unknown) => { success: boolean; error?: unknown } },
  input: unknown,
) {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);

  const error = result.error as { issues: { path: PropertyKey[] }[] };
  return error.issues.map((issue) => issue.path.join("."));
}

const tooLongUnit = "a".repeat(MAX_UNIT_LENGTH + 1);
const tooLongNote = "a".repeat(MAX_NOTE_LENGTH + 1);

describe("createItemSchema, an over-long field names itself", () => {
  test("blames the unit for an over-long unit", () => {
    expect(pathsOfIssues(createItemSchema, { name: "Milk", quantity: 2, unit: tooLongUnit })).toEqual(["unit"]);
  });

  test("blames the note for an over-long note", () => {
    expect(pathsOfIssues(createItemSchema, { name: "Milk", note: tooLongNote })).toEqual(["note"]);
  });
});

describe("updateItemSchema, an over-long field names itself", () => {
  test("blames the unit for an over-long unit", () => {
    expect(pathsOfIssues(updateItemSchema, { quantity: 1, unit: tooLongUnit })).toEqual(["unit"]);
  });

  test("blames the note for an over-long note", () => {
    expect(pathsOfIssues(updateItemSchema, { note: tooLongNote })).toEqual(["note"]);
  });
});
