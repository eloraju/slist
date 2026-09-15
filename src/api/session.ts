import type { Auth } from "../auth/auth";
import type { AppError } from "../lib/errors";
import type { Account } from "../lib/permissions";
import { err, ok, type Result } from "../lib/result";

/**
 * The actor behind a request. Every visitor has an Account from their first visit (ADR-0003), so
 * a missing session means a client that dropped its cookie, not a guest mode.
 */
export async function requireAccount(req: Request, auth: Auth): Promise<Result<Account, AppError>> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (session === null) return err({ kind: "unauthenticated" });

  return ok({ id: session.user.id });
}
