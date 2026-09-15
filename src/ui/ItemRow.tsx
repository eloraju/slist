import { useState } from "react";
import { itemFieldsFrom, type ItemFields } from "../lib/item-draft";
import type { Item } from "./api";

/**
 * A tick and a delete are instant: they fire on the click. The edited fields sit behind Save and
 * Cancel, so nothing is debounced and Cancel sends nothing at all — the draft is thrown away.
 */
export type ItemRowProps = {
  item: Item;
  onToggleChecked: (item: Item) => void;
  onSave: (item: Item, fields: ItemFields) => void;
  onDelete: (item: Item) => void;
};

export function ItemRow({ item, onToggleChecked, onSave, onDelete }: ItemRowProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="item item-editing">
        <ItemEditor
          item={item}
          onCancel={() => setEditing(false)}
          onSave={(fields) => {
            setEditing(false);
            onSave(item, fields);
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
  onSave: (fields: ItemFields) => void;
  onCancel: () => void;
};

function ItemEditor({ item, onSave, onCancel }: ItemEditorProps) {
  // The draft lives here and nowhere else, so abandoning it is Cancel doing nothing.
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity === null ? "" : String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const [rejected, setRejected] = useState<string | null>(null);

  return (
    <form
      className="item-editor"
      onSubmit={(event) => {
        event.preventDefault();
        const fields = itemFieldsFrom({ name, quantity, unit, note });
        // A draft the pure core refuses stays on screen with its message: Save does nothing, and
        // nothing is sent, so the typo is still there to correct.
        if (!fields.ok) {
          setRejected(`"${fields.error.value}" is not a number`);
          return;
        }
        setRejected(null);
        onSave(fields.value);
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
      {rejected !== null && <span className="error">{rejected}</span>}
    </form>
  );
}
