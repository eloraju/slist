/**
 * Ordering is the client's, and only the client's, business — Items and Lists alike. The server
 * orders nothing, so there is one story about where ordering lives when realtime refetching
 * starts returning rows in whatever order the database felt like.
 *
 * A Checked Item stays on its List, so it sinks to the bottom rather than disappearing
 * (CONTEXT.md, "Checked").
 */
export type Named = { name: string };

export type SortableItem = Named & { checked: boolean };

export function byCheckedThenName(a: SortableItem, b: SortableItem): number {
  if (a.checked !== b.checked) return a.checked ? 1 : -1;

  return byName(a, b);
}

/**
 * The order of the Lists, and the tie-breaker within a group of Items. Case-insensitive, because
 * "weekly shop" and "Weekly shop" are the same word to the person reading them.
 */
export function byName(a: Named, b: Named): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}
