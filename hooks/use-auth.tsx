"use client";

import * as React from "react";

/**
 * The sign-in gate.
 *
 * ## Where the credentials live
 *
 * Not here. They are `AUTH_EMAIL` and `AUTH_PASSWORD` in the server
 * environment, and the comparison happens in `app/api/auth/login/route.ts`.
 * This file used to hold them as a constant, which meant they were compiled
 * into the browser bundle and committed to the repository — visible to anyone
 * with devtools or repo access. Nothing in this module knows them now.
 *
 * ## What this still is not
 *
 * A UI gate, not a security boundary. The session it keeps is a flag in the
 * browser's own storage, so it can be set by hand, and the `/api` data routes
 * are unauthenticated and answer whether or not anyone signed in. Making it
 * real means an httpOnly cookie set by that route and read in `withApi` — see
 * `app/api/_lib/handler.ts`, which documents that exact insertion point as the
 * single choke point every data request passes through.
 */

/**
 * One message for every failure.
 *
 * Never "no such user" or "wrong password" — a login form that distinguishes
 * the two tells an attacker which half they got right. The server sends its own
 * copy of this; it is here for the case where the request never arrives.
 */
export const INVALID_CREDENTIALS = "Invalid email or password.";

const ENDPOINT = "/api/auth/login";
const STORAGE_KEY = "authenticated";
/** The signed-in address, kept only so the account menu survives a reload. */
const EMAIL_KEY = "auth.email";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthState {
  status: AuthStatus;
  /** The signed-in address, or `undefined` when nobody is. */
  email?: string;
  /**
   * Asynchronous because it is a real request now, not a fake one.
   *
   * It briefly returned a promise whose only content was a `setTimeout`, so the
   * spinner would be visible — which made every correct sign-in wait 450ms for a
   * decision already made. This awaits one round trip to a route handler,
   * because the comparison it performs cannot happen in the browser without
   * publishing the password. Locally that is a few milliseconds; deployed it is
   * one serverless invocation.
   */
  signIn: (
    email: string,
    password: string,
    remember: boolean,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  signOut: () => void;
}

const AuthContext = React.createContext<AuthState | null>(null);

/**
 * Both stores are read, only one is written.
 *
 * "Remember me" is the choice between them: localStorage survives closing the
 * browser, sessionStorage does not. Reading both means the checkbox decides how
 * long a session lasts rather than being decoration.
 *
 * The address rides alongside the flag because the client no longer knows it —
 * it comes back from the server on a successful sign-in, and without storing it
 * the account menu would forget who is signed in on every reload.
 */
function readSession(): { email: string } | null {
  if (typeof window === "undefined") return null;

  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      if (store.getItem(STORAGE_KEY) === "true") {
        return { email: store.getItem(EMAIL_KEY) ?? "" };
      }
    } catch {
      // Storage disabled — treat as signed out rather than throwing on every
      // page load.
    }
  }
  return null;
}

function writeSession(email: string, remember: boolean) {
  try {
    const keep = remember ? window.localStorage : window.sessionStorage;
    const drop = remember ? window.sessionStorage : window.localStorage;
    keep.setItem(STORAGE_KEY, "true");
    keep.setItem(EMAIL_KEY, email);
    // Clear the other store, or an old "remembered" session would outlive a
    // deliberate one-off sign-in.
    drop.removeItem(STORAGE_KEY);
    drop.removeItem(EMAIL_KEY);
  } catch {
    // Private mode. The session then lasts as long as the tab's memory, which
    // is a degraded experience rather than a broken one.
  }
}

function clearSession() {
  try {
    for (const store of [window.localStorage, window.sessionStorage]) {
      store.removeItem(STORAGE_KEY);
      store.removeItem(EMAIL_KEY);
    }
  } catch {
    // Nothing to clear if storage was never available.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Starts at "loading" on both server and client, so the first client render
  // matches the server's HTML exactly. Storage is read in the effect below —
  // reading it during render would produce markup the server could not have
  // produced, and React would discard the whole tree on hydration.
  const [status, setStatus] = React.useState<AuthStatus>("loading");
  const [email, setEmail] = React.useState<string>();

  // Runs twice under Strict Mode, which is harmless: reading storage has no
  // side effect and both passes compute the same status from the same value.
  React.useEffect(() => {
    const session = readSession();
    setEmail(session?.email);
    setStatus(session ? "authenticated" : "anonymous");
  }, []);

  const signIn = React.useCallback<AuthState["signIn"]>(async (address, password, remember) => {
    let body: { ok?: boolean; email?: string; message?: string };
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, password }),
      });
      body = await response.json();
    } catch {
      // Offline, or the endpoint is unreachable. Say so rather than reporting
      // the credentials as wrong — they may well be right.
      return {
        ok: false,
        message: "Could not reach the server. Check your connection and try again.",
      };
    }

    if (!body.ok) return { ok: false, message: body.message ?? INVALID_CREDENTIALS };

    const confirmed = body.email ?? address.trim().toLowerCase();

    // Storage first, then state. If the write throws, the flag is still set in
    // memory for this tab, and a reload lands back on the login screen rather
    // than on a dashboard the browser cannot remember letting anyone into.
    writeSession(confirmed, remember);
    setEmail(confirmed);
    setStatus("authenticated");
    return { ok: true };
  }, []);

  const signOut = React.useCallback(() => {
    clearSession();
    setEmail(undefined);
    setStatus("anonymous");
  }, []);

  const value = React.useMemo<AuthState>(
    () => ({
      status,
      email: status === "authenticated" ? email : undefined,
      signIn,
      signOut,
    }),
    [status, email, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
