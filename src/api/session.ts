import type { Auth } from "../auth/auth";
import type { AppError } from "../lib/errors";
import type { Account } from "../lib/permissions";
import { err, fromPromise, ok, type Result } from "../lib/result";

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
