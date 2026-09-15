# Lists survive their Owners; no automatic re-homing

Because an Anonymous Account lives in a single cookie (ADR-0003), Owners
disappearing is an expected end state, not an edge case — and the system cannot
detect it, since there is no "account deleted" event, only an Account that stops
appearing.

Rather than guess at absence with a last-seen timer, we remove the problem
structurally: a List may have **several** Owners, and any Owner may promote
another Member. A List whose Owners have all vanished keeps working — Items sync,
Editors edit — and only the Owner-only actions (delete, remove Member, promote)
become unavailable. There is no automatic promotion and no claim flow.

## Considered options

- **Auto-promote the longest-standing Member after N days**: needs last-seen
  tracking and a background job, silently grants destructive powers, and demotes
  an Owner who returns from a long holiday.
- **Claimable ownerless Lists**: same absence-detection problem, plus UI.

Both rest on "absent for N days" being distinguishable from a holiday. It is not.
