/**
 * The browser's view of the REST surface. Every call is a deliberate action by the person using
 * the app — a tick, a delete, a Save — so there is nothing here that fires on its own and nothing
 * debounced (ADR-0002).
 */
export type ListSummary = { id: string; name: string; createdAt: string };

export type Item = {
  id: string;
  listId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  checked: boolean;
};

export type ItemDraft = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  note?: string | null;
};

export async function fetchLists(): Promise<ListSummary[]> {
  const body = await request<{ lists: ListSummary[] }>("GET", "/api/lists");
  return body.lists;
}

export function createList(name: string): Promise<ListSummary> {
  return request<ListSummary>("POST", "/api/lists", { name });
}

export function renameList(listId: string, name: string): Promise<ListSummary> {
  return request<ListSummary>("PATCH", `/api/lists/${listId}`, { name });
}

export function deleteList(listId: string): Promise<null> {
  return request<null>("DELETE", `/api/lists/${listId}`);
}

export function fetchList(listId: string): Promise<{ list: ListSummary; items: Item[] }> {
  return request("GET", `/api/lists/${listId}`);
}

export function addItem(listId: string, draft: ItemDraft): Promise<Item> {
  return request<Item>("POST", `/api/lists/${listId}/items`, draft);
}

export function editItem(listId: string, itemId: string, patch: Partial<ItemDraft>): Promise<Item> {
  return request<Item>("PATCH", `/api/lists/${listId}/items/${itemId}`, patch);
}

export function removeItem(listId: string, itemId: string): Promise<null> {
  return request<null>("DELETE", `/api/lists/${listId}/items/${itemId}`);
}

export function setItemChecked(listId: string, itemId: string, checked: boolean): Promise<Item> {
  return request<Item>("PUT", `/api/lists/${listId}/items/${itemId}/checked`, { checked });
}

export function clearCheckedItems(listId: string): Promise<{ removed: number }> {
  return request("POST", `/api/lists/${listId}/clear-checked`, {});
}

export function uncheckAllItems(listId: string): Promise<{ unchecked: number }> {
  return request("POST", `/api/lists/${listId}/uncheck-all`, {});
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) throw new Error(await messageFor(response));
  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

async function messageFor(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return `${response.status} ${body?.error ?? response.statusText}`;
}
