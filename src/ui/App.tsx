import { useCallback, useEffect, useState } from "react";
import { byCheckedThenName, byName } from "../lib/sort";
import * as api from "./api";
import type { Item, ListSummary } from "./api";
import { itemFieldsFrom, type ItemFields } from "../lib/item-draft";
import { ItemRow } from "./ItemRow";
import "../index.css";

/**
 * One person, one device, one real shopping list. Instant actions — tick, delete, the two bulk
 * actions — fire on the click and then reconcile with the server's answer. Edited fields sit
 * behind Save and Cancel (ADR-0002).
 *
 * Sorting is here, never on the server: Items have no inherent order.
 */
export function App() {
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [selected, setSelected] = useState<ListSummary | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<void>) => {
    try {
      await action();
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  // The one thing that happens without a click: the Lists this Account already has.
  useEffect(() => {
    let unmounted = false;
    api.fetchLists().then(
      (loaded) => !unmounted && setLists(loaded),
      (cause: unknown) => !unmounted && setError(messageOf(cause)),
    );
    return () => {
      unmounted = true;
    };
  }, []);

  const openList = (list: ListSummary) =>
    run(async () => {
      const opened = await api.fetchList(list.id);
      setSelected(opened.list);
      setItems(opened.items);
    });

  const addList = (name: string) =>
    run(async () => {
      const created = await api.createList(name);
      setLists((current) => [...current, created]);
      setSelected(created);
      setItems([]);
    });

  const rename = (name: string) =>
    run(async () => {
      if (selected === null) return;
      const renamed = await api.renameList(selected.id, name);
      setSelected(renamed);
      setLists((current) => current.map((list) => (list.id === renamed.id ? renamed : list)));
    });

  const removeList = () =>
    run(async () => {
      if (selected === null) return;
      await api.deleteList(selected.id);
      setLists((current) => current.filter((list) => list.id !== selected.id));
      setSelected(null);
      setItems([]);
    });

  const addItem = (draft: ItemFields) =>
    run(async () => {
      if (selected === null) return;
      const created = await api.addItem(selected.id, {
        name: draft.name,
        ...(draft.quantity === null ? {} : { quantity: draft.quantity }),
        ...(draft.unit === null ? {} : { unit: draft.unit }),
        ...(draft.note === null ? {} : { note: draft.note }),
      });
      setItems((current) => [...current, created]);
    });

  const toggleChecked = (item: Item) =>
    runOptimistic(async (listId) => {
      // Instant: the tick lands before the request does, and the server's answer replaces it.
      replaceItem({ ...item, checked: !item.checked });
      replaceItem(await api.setItemChecked(listId, item.id, !item.checked));
    });

  const saveItem = (item: Item, fields: ItemFields) =>
    run(async () => {
      if (selected === null) return;
      replaceItem(await api.editItem(selected.id, item.id, fields));
    });

  const deleteItem = (item: Item) =>
    runOptimistic(async (listId) => {
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      await api.removeItem(listId, item.id);
    });

  const clearChecked = () =>
    run(async () => {
      if (selected === null) return;
      await api.clearCheckedItems(selected.id);
      setItems((current) => current.filter((item) => !item.checked));
    });

  const uncheckAll = () =>
    run(async () => {
      if (selected === null) return;
      await api.uncheckAllItems(selected.id);
      setItems((current) => current.map((item) => ({ ...item, checked: false })));
    });

  /**
   * An instant action that has already changed the screen. If the request is refused — a 403, a
   * 404, a List someone else deleted — the screen is now asserting something the server rejected,
   * so the List is refetched rather than left standing behind an error banner. ADR-0002 accepts
   * last-write-wins; it does not accept a UI showing state the server refused.
   *
   * The server's answer replaces the guess, rather than an inverse computed here: undoing a tick
   * locally would be a second guess about what the row now says.
   */
  function runOptimistic(action: (listId: string) => Promise<void>): Promise<void> {
    const listId = selected?.id;
    if (listId === undefined) return Promise.resolve();

    return run(async () => {
      try {
        await action(listId);
      } catch (cause) {
        await reconcile(listId);
        throw cause;
      }
    });
  }

  /** The server's version of this List, or the index if the List itself has gone. */
  async function reconcile(listId: string): Promise<void> {
    try {
      const reloaded = await api.fetchList(listId);
      setSelected(reloaded.list);
      setItems(reloaded.items);
    } catch {
      setSelected(null);
      setItems([]);
      setLists(await api.fetchLists().catch(() => []));
    }
  }

  function replaceItem(item: Item): void {
    setItems((current) => current.map((candidate) => (candidate.id === item.id ? item : candidate)));
  }

  // Ordering is the client's job for Lists as well as Items: the server orders nothing.
  const sortedLists = [...lists].sort(byName);
  const sortedItems = [...items].sort(byCheckedThenName);

  return (
    <main className="app">
      <header>
        <h1>slist</h1>
        {error !== null && <p className="error">{error}</p>}
      </header>

      <section className="lists">
        <ul>
          {sortedLists.map((list) => (
            <li key={list.id}>
              <button
                type="button"
                className={selected?.id === list.id ? "selected" : ""}
                onClick={() => openList(list)}
              >
                {list.name}
              </button>
            </li>
          ))}
        </ul>
        <NameForm label="New list" submitLabel="Create" onSubmit={addList} />
      </section>

      {selected !== null && (
        <section className="list">
          <ListHeader list={selected} onRename={rename} onDelete={removeList} />
          <AddItemForm onAdd={addItem} />
          <ul className="items">
            {sortedItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onToggleChecked={toggleChecked}
                onSave={saveItem}
                onDelete={deleteItem}
              />
            ))}
          </ul>
          <div className="bulk">
            <button type="button" onClick={clearChecked}>
              Clear checked
            </button>
            <button type="button" onClick={uncheckAll}>
              Uncheck all
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

/** Renaming is an edited field: it opens, it saves, or it cancels and sends nothing. */
function ListHeader({
  list,
  onRename,
  onDelete,
}: {
  list: ListSummary;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);

  if (!editing) {
    return (
      <div className="list-header">
        <h2>{list.name}</h2>
        <button
          type="button"
          onClick={() => {
            setName(list.name);
            setEditing(true);
          }}
        >
          Rename
        </button>
        <button type="button" onClick={onDelete}>
          Delete list
        </button>
      </div>
    );
  }

  return (
    <form
      className="list-header"
      onSubmit={(event) => {
        event.preventDefault();
        setEditing(false);
        onRename(name.trim());
      }}
    >
      <input aria-label="List name" value={name} onChange={(event) => setName(event.target.value)} />
      <button type="submit">Save</button>
      <button type="button" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </form>
  );
}

function AddItemForm({ onAdd }: { onAdd: (fields: ItemFields) => void }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  const [rejected, setRejected] = useState<string | null>(null);

  return (
    <form
      className="add-item"
      onSubmit={(event) => {
        event.preventDefault();
        const fields = itemFieldsFrom({ name, quantity, unit, note });
        // The draft survives a refusal, so a mistyped quantity is still there to correct.
        if (!fields.ok) {
          setRejected(`"${fields.error.value}" is not a number`);
          return;
        }
        setRejected(null);
        onAdd(fields.value);
        setName("");
        setQuantity("");
        setUnit("");
        setNote("");
      }}
    >
      <input aria-label="Item" placeholder="Item" value={name} onChange={(event) => setName(event.target.value)} />
      <input
        aria-label="Quantity"
        placeholder="Qty"
        inputMode="decimal"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
      />
      <input aria-label="Unit" placeholder="Unit" value={unit} onChange={(event) => setUnit(event.target.value)} />
      <input aria-label="Note" placeholder="Note" value={note} onChange={(event) => setNote(event.target.value)} />
      <button type="submit">Add</button>
      {rejected !== null && <span className="error">{rejected}</span>}
    </form>
  );
}

function NameForm({
  label,
  submitLabel,
  onSubmit,
}: {
  label: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(name.trim());
        setName("");
      }}
    >
      <input aria-label={label} placeholder={label} value={name} onChange={(event) => setName(event.target.value)} />
      <button type="submit">{submitLabel}</button>
    </form>
  );
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export default App;
