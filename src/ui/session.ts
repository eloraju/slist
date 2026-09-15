import { err, ok, type Result } from "../lib/result";

/**
 * The browser's session bootstrap: a visitor is a real Account from their first visit (ADR-0003),
 * and the client is what asks for one, on any path the app is opened at.
 */
export type Session = { accountId: string };

export type SessionError =
  | { kind: "session_check_failed"; status?: number; cause?: unknown }
  | { kind: "sign_in_failed"; status?: number; cause?: unknown };

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

export async function ensureSession(fetcher: Fetcher): Promise<Result<Session, SessionError>> {
  const existing = await readSession(fetcher);
  if (existing.ok && existing.value !== null) return ok(existing.value);
  return signInAnonymously(fetcher);
}

async function readSession(fetcher: Fetcher): Promise<Result<Session | null, SessionError>> {
  try {
    const response = await fetcher("/api/auth/get-session", { headers: { accept: "application/json" } });
    if (!response.ok) return err({ kind: "session_check_failed", status: response.status });
    const body = (await response.json()) as { user?: { id: string } } | null;
    return ok(body?.user === undefined ? null : { accountId: body.user.id });
  } catch (cause) {
    return err({ kind: "session_check_failed", cause });
  }
}

async function signInAnonymously(fetcher: Fetcher): Promise<Result<Session, SessionError>> {
  try {
    const response = await fetcher("/api/auth/sign-in/anonymous", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!response.ok) return err({ kind: "sign_in_failed", status: response.status });
    const body = (await response.json()) as { user?: { id: string } };
    if (body.user === undefined) return err({ kind: "sign_in_failed" });
    return ok({ accountId: body.user.id });
  } catch (cause) {
    return err({ kind: "sign_in_failed", cause });
  }
}
