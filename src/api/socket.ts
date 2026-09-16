import type { BunRequest, Server, ServerWebSocket, WebSocketHandler } from "bun";
import type { Auth } from "../auth/auth";
import { accountTopic } from "../lib/wire";
import { respond } from "./http";
import { requireAccount } from "./session";

/**
 * The server's end of the WebSocket (ADR-0006). It carries invalidation down to clients and
 * nothing up: everything the client *does* still goes over REST.
 */
export type SocketData = { accountId: string };

/**
 * `/ws` is a named route rather than a `fetch` fallback: Bun's `RoutesWithUpgrade` lets a route
 * handler return nothing, which is how a successful upgrade is expressed. It resolves ahead of the
 * `"/*"` frontend wildcard by being the more specific pattern, not by being written first.
 *
 * The session is the cookie the browser sends on the upgrade by itself, so there is no token in
 * the URL to leak into a proxy log and no client-side auth code at all.
 */
export function socketRoutes(auth: Auth) {
  return {
    "/ws": async (req: BunRequest<"/ws">, server: Server<SocketData>): Promise<Response | undefined> => {
      const actor = await requireAccount(req, auth);
      if (!actor.ok) return respond(actor);

      const data: SocketData = { accountId: actor.value.id };
      if (server.upgrade(req, { data })) return undefined;

      // A plain GET of `/ws` is a client that meant something else; it is not a domain failure,
      // so it does not travel as an `AppError`.
      return new Response("expected a WebSocket upgrade", { status: 426 });
    },
  };
}

/**
 * A socket subscribes to its own Account's topic and to nothing else (ADR-0006): the publisher
 * resolves recipients at publish time, so a Membership appearing or disappearing never needs a
 * re-subscription.
 *
 * There is deliberately **no `message` handler**. The socket is strictly server-to-client, and
 * ADR-0006 wants "the client cannot tell the server anything over the socket" to be a property of
 * this object rather than a convention someone has to remember. Bun's `WebSocketHandler` type
 * declares `message` as required although the runtime does not need it, hence the cast — the one
 * place this file bends a type, and it bends it towards the ADR.
 */
export const websocket = {
  open(ws: ServerWebSocket<SocketData>) {
    ws.subscribe(accountTopic(ws.data.accountId));
  },
} as WebSocketHandler<SocketData>;
