import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Page-shaped skeletons.
 *
 * Each mirrors the real layout's grid and heights so the content doesn't jump
 * when data lands — the point of a skeleton is to reserve the space, not just
 * to look busy.
 */

export function MetricCardSkeleton() {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-12" />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-8 w-20 sm:w-24" />
      </div>
    </div>
  );
}

export function MetricGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <MetricCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function WebsiteCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-24" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-border pt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-card",
        className,
      )}
    >
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
      <Skeleton className="h-[240px] w-full rounded-lg" />
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="flex items-center gap-4 border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="ml-auto h-8 w-56" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="hidden h-4 w-16 sm:block" />
            <Skeleton className="hidden h-4 w-16 md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The full website-dashboard shell. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <MetricGridSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCardSkeleton className="lg:col-span-2" />
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TableSkeleton rows={6} />
        <TableSkeleton rows={6} />
      </div>
    </div>
  );
}
