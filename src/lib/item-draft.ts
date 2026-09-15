import { err, ok, type Result } from "./result";

/**
 * What the four edited inputs are worth once the person presses Save. Text inputs hand back
 * strings, always; turning those into an Item's fields is a decision with a wrong answer in it,
 * so it lives in the pure core where it is tested rather than in a row component.
 */
export type ItemDraft = { name: string; quantity: string; unit: string; note: string };

export type ItemFields = {
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
};

export type DraftError = { kind: "quantity_not_a_number"; value: string };

export function itemFieldsFrom(draft: ItemDraft): Result<ItemFields, DraftError> {
  const quantity = quantityFrom(draft.quantity);
  if (!quantity.ok) return quantity;

  const unit = textOrNothing(draft.unit);

  return ok({
    name: draft.name.trim(),
    quantity: quantity.value,
    // A unit measures nothing on its own, so it goes when the quantity does.
    unit: quantity.value === null ? null : unit,
    note: textOrNothing(draft.note),
  });
}

/**
 * An unparseable quantity is reported rather than treated as "no quantity". Swallowing it would
 * let a typo like "2kg" silently clear the quantity — and the unit with it — while telling the
 * person nothing.
 */
function quantityFrom(value: string): Result<number | null, DraftError> {
  const trimmed = value.trim();
  if (trimmed === "") return ok(null);

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return err({ kind: "quantity_not_a_number", value });

  return ok(parsed);
}

function textOrNothing(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}
