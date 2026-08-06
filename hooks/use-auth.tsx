"use client";

import * as React from "react";

/**
 * The sign-in gate.
 *
 * ## What this is, and what it is not
 *
 * A UI gate, not a security boundary. The credentials below are compiled into
 * the browser bundle and the comparison runs in the browser, so anyone who
 * wants past it can read them in devtools. More to the point, the Route
 * Handlers under `/api` are unauthenticated and return the same Google data
 * whether or not anyone signed in — so this keeps the dashboard behind a
 * deliberate step for the people meant to use it, and protects nothing.
 *
 * Making it real is a contained change, and the hook for it already exists:
 * move the comparison into a Route Handler, set an httpOnly cookie, and read it
 * in `withApi` (see `app/api/_lib/handler.ts`, which documents that exact
 * insertion point as the single choke point every data request passes through).
 * Until then, treat the dashboard as public and the login screen as a door with
 * no lock.
 */

const CREDENTIALS = {
  email: "apps@nextdot.co.in",
  password: "1234@Nextdot",
};

/**
 * One message for every failure.
 *
 * Never "no such user" or "wrong password" — a login form that distinguishes
 * the two tells an attacker which half they got right.
 */
export const INVALID_CREDENTIALS = "Invalid email or password.";

const STORAGE_KEY = "authenticated";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthState {
  status: AuthStatus;
  /** The signed-in address, or `undefined` when nobody is. */
  email?: string;
  /**
   * Synchronous, and deliberately so.
   *
   * This is a string comparison against a constant — there is no request to
   * await. It returned a promise once, with a `setTimeout` inside it purely so
   * the button's spinner would be visible. That is exactly backwards: it made
   * every correct sign-in wait 450ms for a decision already made, and it
   * disguised a real hang further down as "still loading". A sign-in that
   * cannot fail slowly should not be able to look like it is.
   */
  signIn: (
    email: string,
    password: string,
    remember: boolean,
  ) => { ok: true } | { ok: false; message: string };
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
 * The value is the flag itself — there is one account, so the address is a
 * constant and storing it would only create something that could disagree with
 * `CREDENTIALS`.
 */
function isSignedIn(): boolean {
  if (typeof window === "undefined") return false;

  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      if (store.getItem(STORAGE_KEY) === "true") return true;
    } catch {
      // Storage disabled — treat as signed out rather than throwing on every
      // page load.
    }
  }
  return false;
}

function writeSession(remember: boolean) {
  try {
    const keep = remember ? window.localStorage : window.sessionStorage;
    const drop = remember ? window.sessionStorage : window.localStorage;
    keep.setItem(STORAGE_KEY, "true");
    // Clear the other store, or an old "remembered" session would outlive a
    // deliberate one-off sign-in.
    drop.removeItem(STORAGE_KEY);
  } catch {
    // Private mode. The session then lasts as long as the tab's memory, which
    // is a degraded experience rather than a broken one.
  }
}

function clearSession() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
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

  // Runs twice under Strict Mode, which is harmless: reading storage has no
  // side effect and both passes compute the same status from the same value.
  React.useEffect(() => {
    setStatus(isSignedIn() ? "authenticated" : "anonymous");
  }, []);

  const signIn = React.useCallback<AuthState["signIn"]>((email, password, remember) => {
    // Addresses are case-insensitive in practice, so matching one on case would
    // reject a correct sign-in for no reason. The password is compared exactly,
    // as passwords must be.
    const matches =
      email.trim().toLowerCase() === CREDENTIALS.email && password === CREDENTIALS.password;

    if (!matches) return { ok: false, message: INVALID_CREDENTIALS };

    // Storage first, then state. If the write throws the flag is still set in
    // memory for this tab, and a reload lands back on the login screen rather
    // than on a dashboard the browser cannot remember letting anyone into.
    writeSession(remember);
    setStatus("authenticated");
    return { ok: true };
  }, []);

  const signOut = React.useCallback(() => {
    clearSession();
    setStatus("anonymous");
  }, []);

  const value = React.useMemo<AuthState>(
    () => ({
      status,
      // One account, so the address is the constant rather than something read
      // back from storage.
      email: status === "authenticated" ? CREDENTIALS.email : undefined,
      signIn,
      signOut,
    }),
    [status, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
