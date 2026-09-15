# Slist

A self-hosted, multi-user list application. People keep shared lists (shopping,
todo) that stay in sync across their devices and with the people they share
them with, in realtime.

## Language

**Account**:
The identity that owns and is granted access to Lists. Every visitor has one
from their first visit; there is no un-authenticated mode.
_Avoid_: Profile, Member (Member is a role on a List, not an identity)

**Anonymous Account**:
An Account with no email attached, created automatically on first visit and
held by a session cookie on one device. Fully functional: it owns Lists, syncs,
and can share. Losing the cookie loses the Account.
_Avoid_: Guest, Anonymous user, Local user

**Registered Account**:
An Account that has had an email attached to it, making it recoverable and
reachable from more than one device. Registering upgrades an existing Anonymous
Account in place; it never creates a second Account.
_Avoid_: Signed-up user, Real account

**List**:
A named collection of Items, owned by one Account and shared with others
through Memberships. The unit of sharing, syncing and permission.
_Avoid_: Board, Collection, Group

**Membership**:
The link between an Account and a List, carrying exactly one Role. An Account
with no Membership on a List cannot see it at all.
_Avoid_: Share, Collaborator, Participant, Access

**Role**:
A named bundle of Permissions held by a Membership. Roles are defined in code,
not data, so the set of Roles is the same on every installation.
_Avoid_: Level, Tier, Group

**Permission**:
A single capability, checked as a boolean at the moment of an action, always
scoped to one List. Every capability check in the app goes through one
`can(account, permission, list)` function; nothing reads a Role directly.
_Avoid_: Right, Grant, Scope, Policy

**Owner**:
The Role holding every Permission, including the ones no other Role holds:
deleting the List, removing Members, and promoting another Member to Owner. The
creator of a List starts as its Owner, but a List may have several, and it may
end up with none.
_Avoid_: Admin, Creator

**Ownerless List**:
A List whose Owners have all become unreachable. It keeps working: Items sync
and Editors edit as normal. Only the Owner-only Permissions are unavailable,
and there is no automatic recovery.
_Avoid_: Orphaned list, Abandoned list

**Editor**:
The Role granted to invited Members. Holds every Item Permission but cannot
delete the List or remove other Members.
_Avoid_: Contributor, Collaborator, Writer

**Invite**:
A single-use, expiring token issued by a Member of a List, naming the Role the
redeemer will receive. Redeeming it creates a Membership and consumes the
Invite; an unredeemed Invite expires on its own.
_Avoid_: Share link, Invitation code, Join link

**Item**:
One thing on a List. Carries a name, a Checked state, and optionally a numeric
quantity, a unit for that quantity, and a free-text note. Anything that is not
a number and a unit belongs in the note. Items have no inherent order.
_Avoid_: Entry, Task, Todo, Row, Line

**Checked**:
An Item's state of having been dealt with: picked up, bought, done. A Checked
Item stays on its List and remains visible; it is never hidden or removed as a
side effect of being Checked.
_Avoid_: Done, Completed, Ticked, Acquired
