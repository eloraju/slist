# No client cache library; refetching is the invalidation

The browser keeps its server state in plain React state, and a change is applied
by refetching. There is no TanStack Query, and no other cache library.

`PLAN.md` named TanStack Query in the stack from the start, and Phase 2's
original scope said "the client invalidates the matching TanStack Query key".
When Phase 2 began, the dependency had never been installed: Phase 1 shipped
`src/ui/App.tsx` on `useState` plus a `reconcile(listId)` function that refetches
a List. The decision is to keep it that way.

The client holds two queries — the List index, and the one open List — and Phase
3 adds a third. Against that, `invalidateQueries` would cost a rewrite of the
whole `run` / `runOptimistic` / `reconcile` data flow into queries and mutations
with rollback, to replace a refetch function that already exists and is already
the thing Phase 2 needs to call.

It also would not have bought the other thing it is often reached for. TanStack
Query's mutation `retry` has no ordering guarantee and no notion of dropping a
queued edit to a deleted Item, so it is not an answer to the retry question
ADR-0002 declines.

## Consequences

Every socket message is handled by calling the same refetch the rest of the app
uses; there is one code path for "get the truth", not a cache layer beside it.

The trigger to revisit this is **query count, not phase number**. When the number
of distinct server resources the client holds makes hand-written refetching the
thing that is buggy, install the library and do the rewrite then. Realtime, on
its own, is not that trigger.
