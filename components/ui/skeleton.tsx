import { cn } from "@/lib/utils";

/**
 * Base shimmer block. Composed into page-shaped skeletons in
 * `components/dashboard/loading-skeleton.tsx` — prefer those over hand-rolling
 * a layout out of raw blocks.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-md bg-muted", className)}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-background/60 to-transparent" />
    </div>
  );
}

export { Skeleton };
