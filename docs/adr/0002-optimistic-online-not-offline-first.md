# Optimistic-online, not offline-first

Edits apply to the local UI instantly and are sent immediately. A request that
fails is surfaced to the person, and any instant action that has already changed
the screen refetches its List so that what is shown is what the server actually
holds. The edit itself is lost. Nothing is queued, nothing is retried, and
nothing survives the tab closing. We are not building durable offline queues.

True offline-first would roughly triple the build: a durable client-side queue,
gap detection, and a real conflict model, none of which is list functionality.
The case it wins — shopping in a dead zone with the app closed — is narrow
enough to trade away for shipping the actual app.

## Consequences

Concurrent edits are resolved last-write-wins with no merge logic. Two people
racing on the same Item is accepted as a non-problem at household scale, and
ticking is idempotent in practice.

A refused instant action is never left standing on screen. Refuse, tell the
person, show the truth: the UI may not assert state the server rejected.

## Narrowed, 2026-09-16

The original text promised that "failed requests retry while the tab is open",
and nothing ever retried (issue #17). The promise was withdrawn rather than
implemented.

A retry queue is not a small fix. Only transport failures and 5xx are candidates
— a 400 or a 403 re-sent changes nothing — and a queue must additionally keep
two mutations on the same Item in order and drop a queued edit to an Item whose
delete has already succeeded. It must also arbitrate with the refetch above,
which is a second, contradictory answer to the same event. That is a feature
with its own design, not a clause in an ADR.

Realtime (Phase 2) does not supply it either: invalidation-on-reconnect cures a
stale *read*, and a dropped write was never read to begin with. Should retry
ever be wanted, it gets a ticket written from scratch.
