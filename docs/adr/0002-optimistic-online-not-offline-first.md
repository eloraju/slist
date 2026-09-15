# Optimistic-online, not offline-first

Edits apply to the local UI instantly and are sent immediately; failed requests
retry while the tab is open. An edit made with no network **and** the tab closed
is lost. We are not building durable offline queues.

True offline-first would roughly triple the build: a durable client-side queue,
gap detection, and a real conflict model, none of which is list functionality.
The case it wins — shopping in a dead zone with the app closed — is narrow
enough to trade away for shipping the actual app.

## Consequences

Concurrent edits are resolved last-write-wins with no merge logic. Two people
racing on the same Item is accepted as a non-problem at household scale, and
ticking is idempotent in practice.
