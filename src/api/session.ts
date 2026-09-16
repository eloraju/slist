import type { BunRequest, Server } from "bun";
import type { Auth } from "../auth/auth";
import type { AppError } from "../lib/errors";
import type { Account } from "../lib/permissions";
import { err, fromPromise, ok, type Result } from "../lib/result";
import { respond } from "./http";
import type { SocketData } from "./socket";

/**
 * The actor behind a request. Every visitor has an Account from their first visit (ADR-0003), so
 * a missing session means a client that dropped its cookie, not a guest mode.
 */
export async function requireAccount(req: Request, auth: Auth): Promise<Result<Account, AppError>> {
  // Better Auth throws — a dead pool, a bad cookie signature — so it is wrapped at its boundary
  // and enters the codebase as a value (CONVENTIONS.md, "Errors are values"). Unwrapped, the
  // throw became a bare 500 that never reached `statusFor`.
  const session = await fromPromise(auth.api.getSession({ headers: req.headers }), () => null);
  if (!session.ok) return err({ kind: "session_unavailable" });
  if (session.value === null) return err({ kind: "unauthenticated" });

  return ok({ id: session.value.user.id });
}

/**
 * A handler that has already been handed its actor. Ten handlers opened with the same two lines
 * of `requireAccount` preamble, and a new one that forgot the `if (!actor.ok)` line still
 * compiled: this names that step once (CONVENTIONS.md, "Functions read as instructions"). It
 * decides nothing — who may do what stays behind `can()` in the domain layer (ADR-0005).
 *
 * `server` is Bun's second argument to every route handler, and it is passed on because a handler
 * that publishes needs it (ADR-0006); dropping it here would have forced a module-level server
 * reference instead.
 */
export function withActor<T extends string>(
  auth: Auth,
  handler: (req: BunRequest<T>, actor: Account, server: Server<SocketData>) => Promise<Response>,
): (req: BunRequest<T>, server: Server<SocketData>) => Promise<Response> {
  return async (req, server) => {
    const actor = await requireAccount(req, auth);
    if (!actor.ok) return respond(actor);

    return handler(req, actor.value, server);
  };
}
