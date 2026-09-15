import type { SQL } from "bun";
import type { CreateItemInput, UpdateItemInput } from "../lib/schemas";

/** Every line of SQL about Items, and no decisions (CONVENTIONS.md, "Where logic lives"). */
export type ItemRecord = {
  id: string;
  listId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  checked: boolean;
};

type ItemRow = {
  id: string;
  list_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  checked: boolean;
};

/**
 * No `order by`: the server never orders Items, because Items have no inherent order. Sorting is
 * the client's, and only the client's, business.
 */
export async function selectItemsForList(sql: SQL, listId: string): Promise<ItemRecord[]> {
  const rows = (await sql`
    select id, list_id, name, quantity, unit, note, checked from items where list_id = ${listId}
  `) as ItemRow[];

  return rows.map(toItemRecord);
}

export async function insertItem(sql: SQL, listId: string, input: CreateItemInput): Promise<ItemRecord> {
  const [row] = (await sql`
    insert into items (list_id, name, quantity, unit, note)
    values (${listId}, ${input.name}, ${input.quantity ?? null}, ${input.unit ?? null}, ${input.note ?? null})
    returning id, list_id, name, quantity, unit, note, checked
  `) as ItemRow[];
  if (row === undefined) throw new Error("insert into items returned no row");

  return toItemRecord(row);
}

/**
 * A partial update in one statement: a field the payload does not mention keeps its column, and
 * `null` clears it. The `case when` flags say which fields the payload mentioned at all, which
 * `coalesce` alone cannot express — `null` means "clear this", not "leave it".
 */
export async function updateItemFields(
  sql: SQL,
  listId: string,
  itemId: string,
  patch: UpdateItemInput,
): Promise<ItemRecord | undefined> {
  const [row] = (await sql`
    update items set
      name = coalesce(${patch.name ?? null}::text, name),
      quantity = case when ${"quantity" in patch}::boolean then ${patch.quantity ?? null}::double precision else quantity end,
      unit = case when ${"unit" in patch}::boolean then ${patch.unit ?? null}::text else unit end,
      note = case when ${"note" in patch}::boolean then ${patch.note ?? null}::text else note end,
      updated_at = now()
    where id = ${itemId} and list_id = ${listId}
    returning id, list_id, name, quantity, unit, note, checked
  `) as ItemRow[];

  return row === undefined ? undefined : toItemRecord(row);
}

export async function updateItemChecked(
  sql: SQL,
  listId: string,
  itemId: string,
  checked: boolean,
): Promise<ItemRecord | undefined> {
  const [row] = (await sql`
    update items set checked = ${checked}, updated_at = now()
    where id = ${itemId} and list_id = ${listId}
    returning id, list_id, name, quantity, unit, note, checked
  `) as ItemRow[];

  return row === undefined ? undefined : toItemRecord(row);
}

export async function deleteItemById(sql: SQL, listId: string, itemId: string): Promise<boolean> {
  const rows = (await sql`delete from items where id = ${itemId} and list_id = ${listId} returning id`) as {
    id: string;
  }[];

  return rows.length > 0;
}

/** A Checked Item is removed only by this action, never as a side effect of being Checked. */
export async function deleteCheckedItems(sql: SQL, listId: string): Promise<number> {
  const rows = (await sql`delete from items where list_id = ${listId} and checked returning id`) as { id: string }[];

  return rows.length;
}

export async function uncheckItems(sql: SQL, listId: string): Promise<number> {
  const rows = (await sql`
    update items set checked = false, updated_at = now()
    where list_id = ${listId} and checked
    returning id
  `) as { id: string }[];

  return rows.length;
}

function toItemRecord(row: ItemRow): ItemRecord {
  return {
    id: row.id,
    listId: row.list_id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    note: row.note,
    checked: row.checked,
  };
}
