/**
 * The default order of a List, applied by the client only: the server never orders Items, and
 * there is no `position` column for it to order by. A Checked Item stays on its List, so it sinks
 * to the bottom rather than disappearing (CONTEXT.md, "Checked").
 */
export type SortableItem = { name: string; checked: boolean };

export function byCheckedThenName(a: SortableItem, b: SortableItem): number {
  if (a.checked !== b.checked) return a.checked ? 1 : -1;

  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}
