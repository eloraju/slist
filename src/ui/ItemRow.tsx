import { useState } from "react";
import type { Item } from "./api";

/**
 * A tick and a delete are instant: they fire on the click. The edited fields sit behind Save and
 * Cancel, so nothing is debounced and Cancel sends nothing at all — the draft is thrown away.
 */
export type ItemRowProps = {
  item: Item;
  onToggleChecked: (item: Item) => void;
  onSave: (item: Item, patch: ItemPatch) => void;
  onDelete: (item: Item) => void;
};

export type ItemPatch = {
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
};

export function ItemRow({ item, onToggleChecked, onSave, onDelete }: ItemRowProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="item item-editing">
        <ItemEditor
          item={item}
          onCancel={() => setEditing(false)}
          onSave={(patch) => {
            setEditing(false);
            onSave(item, patch);
          }}
        />
      </li>
    );
  }

  return (
    <li className={item.checked ? "item item-checked" : "item"}>
      <label className="item-tick">
        <input type="checkbox" checked={item.checked} onChange={() => onToggleChecked(item)} />
        <span className="item-name">{item.name}</span>
      </label>
      {item.quantity !== null && (
        <span className="item-quantity">
          {item.quantity}
          {item.unit === null ? "" : ` ${item.unit}`}
        </span>
      )}
      {item.note !== null && <span className="item-note">{item.note}</span>}
      <span className="item-actions">
        <button type="button" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button type="button" onClick={() => onDelete(item)}>
          Delete
        </button>
      </span>
    </li>
  );
}

type ItemEditorProps = {
  item: Item;
  onSave: (patch: ItemPatch) => void;
  onCancel: () => void;
};

function ItemEditor({ item, onSave, onCancel }: ItemEditorProps) {
  // The draft lives here and nowhere else, so abandoning it is Cancel doing nothing.
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity === null ? "" : String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? "");
  const [note, setNote] = useState(item.note ?? "");

  return (
    <form
      className="item-editor"
      onSubmit={(event) => {
        event.preventDefault();
        // A unit measures nothing on its own, so clearing the quantity clears the unit here too
        // rather than sending a payload the server will refuse.
        const parsedQuantity = numberOrNull(quantity);
        onSave({
          name: name.trim(),
          quantity: parsedQuantity,
          unit: parsedQuantity === null || unit.trim() === "" ? null : unit.trim(),
          note: note.trim() === "" ? null : note.trim(),
        });
      }}
    >
      <input aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} />
      <input
        aria-label="Quantity"
        inputMode="decimal"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
      />
      <input aria-label="Unit" value={unit} onChange={(event) => setUnit(event.target.value)} />
      <input aria-label="Note" value={note} onChange={(event) => setNote(event.target.value)} />
      <button type="submit">Save</button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

export function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
