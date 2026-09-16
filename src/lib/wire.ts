import { z } from "zod";

/**
 * The messages the server pushes down the WebSocket (ADR-0006). They are invalidation, not data:
 * `data` carries ids and never values, so a rename message says which List was renamed and never
 * what it is now called. A client therefore cannot apply a message optimistically — it can only
 * decide what to refetch — which is ADR-0006's guarantee expressed as a type rather than a rule.
 *
 * Imported by both the server and the browser bundle. `src/lib/schemas.ts` stays what it is:
 * request-body schemas. The discriminator here is `type`, not `kind`, because these are protocol
 * payloads rather than domain values (CONVENTIONS.md, "Errors are values").
 *
 * `item:create`, `item:update` and `item:delete` collide as string literals with existing
 * `Permission` values in `src/lib/permissions.ts`. That is accepted for the shared
 * `namespace:verb` vocabulary; the cost is that grepping either one finds both.
 */

export const MESSAGE_TYPES = [
  "list:create",
  "list:rename",
  "list:delete",
  "item:create",
  "item:update",
  "item:delete",
  "item:check",
  "item:clear_checked",
  "item:uncheck_all",
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

/**
 * A discriminated union rather than one object with a `z.enum` type, so that the day a message
 * needs a payload the others do not — Phase 3's `membership:removed`, which drops the List from
 * view — it is a branch the client must answer for instead of a widened field (ADR-0006). The
 * variants are spelled out for that reason: a mapped union would collapse the discriminator back
 * into a single shape and prove nothing.
 */
const invalidates = <T extends MessageType>(type: T) =>
  z.object({ type: z.literal(type), data: z.object({ listId: z.uuid() }) });

export const messageSchema = z.discriminatedUnion("type", [
  invalidates("list:create"),
  invalidates("list:rename"),
  invalidates("list:delete"),
  invalidates("item:create"),
  invalidates("item:update"),
  invalidates("item:delete"),
  invalidates("item:check"),
  invalidates("item:clear_checked"),
  invalidates("item:uncheck_all"),
]);

export type Message = z.infer<typeof messageSchema>;

/** The one place a message is built, so `data` cannot grow a value by accident. */
export function message(type: MessageType, listId: string): Message {
  return { type, data: { listId } } as Message;
}

/** The one topic a socket subscribes to, and the one a write publishes to (ADR-0006). */
export function accountTopic(accountId: string): string {
  return `account:${accountId}`;
}

/**
 * The browser's end of the union. A payload that does not parse is dropped rather than guessed
 * at: a socket message is untrusted input like any other body.
 */
export function parseMessage(payload: unknown): Message | undefined {
  const text = typeof payload === "string" ? payload : undefined;
  if (text === undefined) return undefined;

  try {
    const parsed = messageSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * NOT COVERED BY ANY TEST: the `can()` filter in `src/api/broadcast.ts` that chooses recipients.
 * Every current Role holds `list:read`, so no fixture can distinguish it from filtering on
 * Membership rows directly. The filter is still written through `can()` because recipients are a
 * capability decision (ADR-0005) — the day a Role appears without `list:read`, the difference is a
 * data leak rather than a missing notification. Recorded here rather than covered by a test that
 * would pass for the wrong reason.
 */
