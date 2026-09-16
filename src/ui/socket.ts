import { parseMessage, type Message } from "../lib/wire";

/**
 * The browser's end of the invalidation socket (ADR-0006). This module is the transport and
 * nothing else: it knows how to stay connected and how to turn a frame into a `Message`, and it
 * knows nothing about Lists, Items or React state. What to refetch is the caller's decision, which
 * is what keeps the reconnect policy testable by hand and out of `App.tsx`.
 *
 * Nothing is ever sent. The server has no `message` handler (ADR-0006), and the session cookie
 * rides along on the upgrade request the way it does on any other same-origin request, so there is
 * no authentication step here either.
 */
export type SocketHandlers = {
  /**
   * Called on every successful connection, the first one included. The caller treats this as
   * "everything you hold may be stale" — on a first open that is trivially true, and on a
   * reconnect it is the whole of ADR-0006's reconnect story, so both are one code path.
   */
  onOpen: () => void;
  onMessage: (message: Message) => void;
};

const FIRST_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

/**
 * Opens the socket and keeps it open, and returns the teardown. The teardown both closes the
 * current socket and cancels a pending reconnect, because React 19's StrictMode runs an effect,
 * tears it down and runs it again in development: a teardown that only closed the socket would
 * leave a timer alive to open a second one.
 */
export function connect(handlers: SocketHandlers): () => void {
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let disposed = false;

  function open(): void {
    if (disposed) return;

    socket = new WebSocket(socketUrl());

    socket.onopen = () => {
      // A connection that opened is a connection that worked, so the next failure starts over at
      // one second rather than wherever the last outage left the backoff.
      failures = 0;
      handlers.onOpen();
    };

    socket.onmessage = (event) => {
      const message = parseMessage(event.data);
      if (message !== undefined) handlers.onMessage(message);
    };

    // A socket that never opened fires `error` then `close`, and one that drops fires `close`
    // alone, so reconnecting from `close` covers both without scheduling two attempts. The error
    // itself is deliberately unread: a socket failure is never shown to the person, because every
    // action in the app already works over HTTP without it.
    socket.onclose = () => {
      if (disposed) return;
      retry = setTimeout(open, backoffMs(failures++));
    };
  }

  open();

  return () => {
    disposed = true;
    clearTimeout(retry);
    // Dropping the handlers first: `close()` fires `onclose` synchronously in some browsers, and
    // `disposed` alone would then be the only thing standing between teardown and a reconnect.
    if (socket !== undefined) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.close();
    }
  };
}

/**
 * One second, doubling per consecutive failure to a thirty-second ceiling, then jittered down into
 * the top half of that window: a wait of between half the delay and all of it. The jitter is what
 * stops every tab in the house — all of which dropped at the same instant, because the server they
 * share restarted — from reconnecting on the same tick and doing it again on the next one. Half
 * rather than the full range so that a long outage keeps backing off meaningfully instead of
 * occasionally retrying almost immediately.
 */
function backoffMs(failures: number): number {
  const capped = Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** failures);
  return capped / 2 + Math.random() * (capped / 2);
}

/** Same origin as the page, so the session cookie is sent and no host needs configuring. */
function socketUrl(): string {
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}/ws`;
}
