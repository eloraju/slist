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

/**
 * One bootstrap per page, however many callers ask for it. React StrictMode runs effects twice in
 * development and a retry button can overlap with an in-flight attempt; without this they race
 * the cookie and the second one signs in again, leaving an orphaned Account behind.
 */
let inFlight: Promise<Result<Session, SessionError>> | null = null;

export function ensureSession(fetcher: Fetcher): Promise<Result<Session, SessionError>> {
  inFlight ??= bootstrap(fetcher).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function bootstrap(fetcher: Fetcher): Promise<Result<Session, SessionError>> {
  const existing = await readSession(fetcher);
  // A failed check is not an answer. Only a definitive "no session" may sign in: an Anonymous
  // Account lives in one cookie on one device, so minting a new one over a network blip or a 5xx
  // would strand this visitor's Lists with no recovery path (ADR-0003).
  if (!existing.ok) return existing;
  if (existing.value !== null) return ok(existing.value);

  return signInAnonymously(fetcher);
}

async function readSession(fetcher: Fetcher): Promise<Result<Session | null, SessionError>> {
  try {
    const response = await fetcher("/api/auth/get-session", { headers: { accept: "application/json" } });
    if (!response.ok) return err({ kind: "session_check_failed", status: response.status });
    // A body that is not a session answer — a proxy's error page, a captive portal — is a failed
    // check, not "no session". `json()` throwing lands in the catch below for the same reason.
    const body = (await response.json()) as { user?: { id: string } } | null;
    if (body === null) return ok(null);
    if (typeof body !== "object" || body.user === undefined) {
      return err({ kind: "session_check_failed", status: response.status });
    }
    return ok({ accountId: body.user.id });
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

/** Same-origin and relative: the app never needs to know its own origin, so it cannot get it wrong. */
export const browserFetch: Fetcher = (path, init) => fetch(path, init);
