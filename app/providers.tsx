"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { FiltersProvider } from "@/hooks/use-filters";
import { PageActionsProvider } from "@/hooks/use-page-actions";
import { AppShellFallback } from "@/components/layout/app-shell-fallback";
import { BrandMark } from "@/components/auth/brand-mark";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";
import { FilterBar } from "@/components/layout/filter-bar";

const LOGIN_PATH = "/login";

/**
 * What renders while the session is being resolved, and during a redirect.
 *
 * Reading storage takes one effect, so this is on screen for about a frame —
 * but it has to be *something*, and it cannot be the dashboard shell. Painting
 * the sidebar and then yanking it away is worse than a moment of quiet, and it
 * would flash the application frame at someone who is not signed in.
 */
function Splash() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <BrandMark className="animate-pulse" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** The application frame: sidebar, navbar, filter bar. Signed-in routes only. */
function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <FiltersProvider>
      <PageActionsProvider>
        <div className="flex min-h-svh">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Navbar />
            <FilterBar />
            <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
          </div>
        </div>
      </PageActionsProvider>
    </FiltersProvider>
  );
}

/**
 * Decides between the login screen and the dashboard.
 *
 * Redirects run in an effect rather than during render — calling `router` while
 * rendering is a React error, and the guard below already prevents the wrong
 * tree from being shown in the meantime. Both directions are handled here:
 * signed out anywhere but `/login` goes to the login screen, and signed in *at*
 * `/login` goes to the dashboard, so a bookmarked login URL does not strand
 * someone who already has a session.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const onLoginRoute = pathname === LOGIN_PATH;

  React.useEffect(() => {
    if (status === "loading") return;
    if (status === "anonymous" && !onLoginRoute) router.replace(LOGIN_PATH);
    if (status === "authenticated" && onLoginRoute) router.replace("/");
  }, [status, onLoginRoute, router]);

  // Checked before `loading`, and deliberately. The login screen has nothing to
  // protect, so it renders immediately instead of waiting on storage — which
  // also means it is the server-rendered HTML rather than something that
  // appears only once the bundle has run. The alternative is every signed-out
  // visitor watching a splash for the length of the JS download.
  //
  // It keeps rendering after a successful sign-in too, until the redirect above
  // lands. Swapping to a splash the instant the status flipped is what made a
  // correct password look like a hang: the card vanished and a pulsing logo sat
  // there for as long as the dashboard route took to load. Leaving the card up
  // with its button already in "Signing in…" reads as continuous.
  //
  // Bare children: this screen brings its own full-page layout and must not be
  // wrapped in the dashboard chrome.
  if (onLoginRoute) return <>{children}</>;

  if (status === "loading") return <Splash />;

  // The redirect above is already scheduled; this is what fills the frame until
  // it lands.
  if (status === "anonymous") return <Splash />;

  return (
    // `FiltersProvider` reads `useSearchParams`, so everything beneath it
    // renders on the client. The Suspense boundary is what contains that — and
    // its fallback is the HTML the browser paints first, so it renders the real
    // chrome rather than `null`. See `AppShellFallback`.
    <React.Suspense fallback={<AppShellFallback />}>
      <AppShell>{children}</AppShell>
    </React.Suspense>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={200} skipDelayDuration={400}>
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
