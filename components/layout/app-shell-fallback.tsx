import { Radar } from "lucide-react";
import { NAV_ITEMS } from "./nav-config";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The server-rendered shell.
 *
 * `FiltersProvider` reads `useSearchParams`, which opts its whole subtree out of
 * static rendering — so whatever this Suspense boundary falls back to *is* the
 * HTML the browser paints before JS arrives. With `fallback={null}` that was a
 * blank page.
 *
 * This renders the real chrome instead: the sidebar and its links are plain
 * markup and need no filter state, so first paint shows the actual application
 * frame with the content area skeletonised, and hydration only has to fill in
 * the middle.
 */
export function AppShellFallback() {
  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-[224px] shrink-0 flex-col border-r border-border bg-card/50 lg:flex">
        <div className="flex h-14 items-center px-3">
          <span className="flex items-center gap-2.5 px-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Radar className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <span className="text-[13px] font-semibold tracking-tight">SEO Portfolio</span>
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <span
              key={item.href}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted-foreground"
            >
              <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              {item.label}
            </span>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 sm:px-6">
          <Skeleton className="h-4 w-40" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-full" />
          </div>
        </div>

        <div className="flex h-[57px] shrink-0 items-center gap-2 border-b border-border px-4 sm:px-6">
          <Skeleton className="h-9 w-[168px] rounded-lg" />
          <Skeleton className="ml-auto h-9 w-56 rounded-lg" />
        </div>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto max-w-[1400px] space-y-8">
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-72" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[104px] rounded-xl" />
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[268px] rounded-xl" />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
