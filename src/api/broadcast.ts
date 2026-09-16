import type { SQL, Server } from "bun";
import { can, type Membership } from "../lib/permissions";
import { accountTopic, message, type MessageType } from "../lib/wire";
import { selectListWithMemberships } from "../lists/queries";
import type { SocketData } from "./socket";

/**
 * The one place a message reaches the wire. Writes publish through this function rather than
 * through scattered `server.publish` calls, so that fanning out across app replicas later — via
 * Postgres `LISTEN/NOTIFY` — is one change rather than a dozen (ADR-0006, "Consequences").
 */
export type BroadcastDeps = { sql: SQL; server: Server<SocketData> };

/**
 * A write happened to a List: tell everyone who may read it, and nobody else.
 *
 * `removedMemberships` is the delete case. After the cascade there is nobody left to ask who to
 * notify, so `deleteList` hands back the rows it removed and they arrive here instead of being
 * loaded (ADR-0006, and the Membership rows are gone by now either way).
 */
export async function broadcast(
  { sql, server }: BroadcastDeps,
  type: MessageType,
  listId: string,
  removedMemberships?: readonly Membership[],
): Promise<void> {
  const memberships = removedMemberships ?? (await membershipsOf(sql, listId));
  const payload = JSON.stringify(message(type, listId));

  for (const accountId of recipientsOf(listId, memberships)) {
    server.publish(accountTopic(accountId), payload);
  }
}

/**
 * Who hears about it. Being told a List changed is a capability, so the answer comes from `can()`
 * and not from the Membership rows directly (ADR-0005), mirroring `listsVisibleTo`. Today every
 * Role holds `list:read` and the two agree; the day one does not, this is a data leak rather than
 * a missing notification — which is why the filter is written this way although no fixture can
 * currently tell the two apart (`src/lib/wire.ts`).
 */
function recipientsOf(listId: string, memberships: readonly Membership[]): string[] {
  const list = { id: listId, memberships };

  return memberships.filter((m) => can({ id: m.accountId }, "list:read", list)).map((m) => m.accountId);
}

/** A List deleted between the write and this read simply has no recipients left. */
async function membershipsOf(sql: SQL, listId: string): Promise<Membership[]> {
  return (await selectListWithMemberships(sql, listId))?.memberships ?? [];
}
