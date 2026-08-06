"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/auth/brand-mark";

/**
 * The sign-in screen.
 *
 * Rendered outside the dashboard shell — see `AuthGate` in `app/providers.tsx`,
 * which swaps the sidebar and navbar for bare children on this route. It is the
 * one page in the app with no chrome, so it owns its own full-height layout.
 *
 * Every surface here is the dashboard's own: `Card`, `Input` and `Button` are
 * the same components the tables and filter bar use, and the palette comes from
 * the same tokens. Nothing is restyled locally, which is what keeps the screen
 * from drifting the first time the theme changes.
 */

/**
 * Deliberately permissive.
 *
 * A login form has no business rejecting an address the server might accept —
 * this only catches the obvious typo (no @, no dot, a trailing space) so the
 * user is not told their *password* is wrong when they mistyped their email.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();

  // Warm the dashboard route before it is asked for. Nothing about the sign-in
  // itself is slow — the wait a user feels is the dashboard bundle loading (and
  // in dev, compiling) *after* the redirect fires. Prefetching moves that work
  // to while they are still typing.
  React.useEffect(() => {
    router.prefetch("/");
  }, [router]);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(true);
  const [revealed, setRevealed] = React.useState(false);
  /** True for the one round trip the credential check takes. Always reset. */
  const [submitting, setSubmitting] = React.useState(false);
  /**
   * Set once, on success, and never cleared — the component unmounts when the
   * route changes.
   *
   * Named for what it is. It was `pending`, set *before* an awaited sign-in, so
   * a slow or failed step past that point left a spinner with no way back to
   * the form. Nothing is pending now: the credential check is synchronous, and
   * the only thing this covers is the route transition.
   */
  const [redirecting, setRedirecting] = React.useState(false);

  /** Field-level, shown under the input it belongs to. */
  const [emailError, setEmailError] = React.useState<string>();
  /** Form-level: the credential rejection, shown above the fields. */
  const [formError, setFormError] = React.useState<string>();

  const filled = email.trim().length > 0 && password.length > 0;

  const onSubmit = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!filled || submitting || redirecting) return;

      // Clear both on every attempt, so a stale message never sits above a
      // field the user has since corrected.
      setEmailError(undefined);
      setFormError(undefined);

      if (!EMAIL_SHAPE.test(email.trim())) {
        setEmailError("Enter a valid email address.");
        return;
      }

      setSubmitting(true);
      try {
        const result = await signIn(email, password, remember);

        if (!result.ok) {
          setFormError(result.message);
          setPassword("");
          return;
        }

        // The redirect is not issued here. `AuthGate` already enforces "a
        // signed-in visitor does not sit on /login" — it has to, for anyone
        // arriving with a session from a bookmark — so calling `router.replace`
        // here too would be a second code path doing one job, racing the first.
        // `signIn` has just flipped the status, so that effect runs on this
        // commit.
        setRedirecting(true);
      } finally {
        // Always, including the early return above and any throw. This is the
        // guarantee that a failed attempt can never leave the form disabled
        // with a spinner on it.
        setSubmitting(false);
      }
    },
    [email, password, remember, filled, submitting, redirecting, signIn],
  );

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-10 sm:px-6">
      <main className="w-full max-w-[420px] animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out">
        <Card className="p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <BrandMark />
            <h1 className="mt-5 text-xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              Sign in to continue to your SEO Portfolio dashboard.
            </p>
          </div>

          <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
            {/*
              `role="alert"` so a screen reader announces the rejection. Without
              it the only signal that anything happened is a colour change the
              user may not be looking at.
            */}
            {formError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-2.5 text-[13px] leading-relaxed text-destructive"
              >
                <AlertCircle className="mt-px h-4 w-4 shrink-0" strokeWidth={2} />
                {formError}
              </p>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-[13px] font-medium">
                Email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                // Generic on purpose. The real address as a placeholder put half
                // the credential back into the client bundle and onto the
                // screen, which is what moving the check server-side was for.
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? "email-error" : undefined}
                className={cn("h-10", emailError && "border-destructive/60")}
              />
              {emailError && (
                <p id="email-error" className="text-[12px] text-destructive">
                  {emailError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="password" className="block text-[13px] font-medium">
                  Password
                </label>
                {/*
                  Inert on purpose — there is no account system behind it. A
                  button rather than an anchor: a link to nowhere is a broken
                  link, and `href="#"` would scroll the page.
                */}
                <button
                  type="button"
                  className="rounded text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Forgot password?
                </button>
              </div>

              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={revealed ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setRevealed((v) => !v)}
                  // The label states the action, not the state — "Show
                  // password" is what pressing it does.
                  aria-label={revealed ? "Hide password" : "Show password"}
                  aria-pressed={revealed}
                  className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {revealed ? (
                    <EyeOff className="h-4 w-4" strokeWidth={2} />
                  ) : (
                    <Eye className="h-4 w-4" strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>

            {/*
              A native checkbox, tinted with `accent-color` rather than rebuilt
              out of divs. It keeps the platform's keyboard and screen-reader
              behaviour for free, and this is the only one in the app — a custom
              primitive would be more code for a worse control.
            */}
            <label className="flex w-fit cursor-pointer items-center gap-2 py-0.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              Remember me
            </label>

            {/*
              One spinner for two phases that read as one wait: the credential
              check, and the route transition after it. Splitting them would
              flicker the button back to its resting state in between.
            */}
            <Button
              type="submit"
              size="lg"
              disabled={!filled || submitting || redirecting}
              className="w-full"
            >
              {submitting || redirecting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-[12px] text-muted-foreground">
          SEO Portfolio © 2026
        </p>
      </main>
    </div>
  );
}
