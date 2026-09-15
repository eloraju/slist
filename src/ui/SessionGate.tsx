import { useEffect, useState, type ReactNode } from "react";
import { browserFetch, ensureSession } from "./session";

type Bootstrap = { state: "starting" } | { state: "ready" } | { state: "unavailable" };

/**
 * A visitor is a real Account from their first visit (ADR-0003), and the client is what asks for
 * one — on `/` and on a bookmarked `/lists/abc` alike. The app waits behind this: every call it
 * makes needs the session that this resolves.
 *
 * A failed bootstrap offers a retry and nothing else. It must not look like a fresh start: the
 * existing cookie may be perfectly good, and signing in again would strand the Lists behind it.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const [bootstrap, setBootstrap] = useState<Bootstrap>({ state: "starting" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let abandoned = false;
    ensureSession(browserFetch).then((session) => {
      if (abandoned) return;
      setBootstrap({ state: session.ok ? "ready" : "unavailable" });
    });
    return () => {
      abandoned = true;
    };
  }, [attempt]);

  if (bootstrap.state === "ready") return <>{children}</>;

  return (
    <main className="app">
      <header>
        <h1>slist</h1>
      </header>
      {bootstrap.state === "starting" ? (
        <p>Starting…</p>
      ) : (
        <>
          <p className="error">Could not reach the server. Your lists are safe — this is a connection problem.</p>
          <button
            type="button"
            onClick={() => {
              setBootstrap({ state: "starting" });
              setAttempt((count) => count + 1);
            }}
          >
            Try again
          </button>
        </>
      )}
    </main>
  );
}
