"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FiltersProvider } from "@/hooks/use-filters";
import { PageActionsProvider } from "@/hooks/use-page-actions";
import { AppShellFallback } from "@/components/layout/app-shell-fallback";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";
import { FilterBar } from "@/components/layout/filter-bar";

/**
 * `FiltersProvider` reads `useSearchParams`, so everything beneath it renders on
 * the client. The Suspense boundary is what contains that — and its fallback is
 * the HTML the browser paints first, so it renders the real chrome rather than
 * `null`. See `AppShellFallback`.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={200} skipDelayDuration={400}>
        <React.Suspense fallback={<AppShellFallback />}>
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
        </React.Suspense>
      </TooltipProvider>
    </ThemeProvider>
  );
}
