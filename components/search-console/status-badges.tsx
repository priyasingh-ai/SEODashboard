import { ArrowDownRight, ArrowUpRight, Equal, MinusCircle, Sparkles, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MovementRowKind } from "@/types";
import type { PageHealth } from "@/lib/search-insights";

/**
 * The small status chips used across the Search Console intelligence tables.
 *
 * Each carries its own word alongside the colour, so meaning never depends on
 * distinguishing red from amber. Palettes are declared for light and dark
 * explicitly, matching the existing `TrendBadge`.
 */

const MOVEMENT: Record<MovementRowKind, { label: string; icon: LucideIcon; tone: string }> = {
  improved: {
    label: "Improved",
    icon: ArrowUpRight,
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  dropped: {
    label: "Dropped",
    icon: ArrowDownRight,
    tone: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
  new: {
    label: "New",
    icon: Sparkles,
    tone: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  lost: {
    label: "Lost",
    icon: MinusCircle,
    tone: "bg-secondary text-muted-foreground",
  },
  // Neutral by design: holding position is neither a win nor a problem, and
  // colouring it would put visual weight on the majority of a site's keywords.
  stable: {
    label: "No change",
    icon: Equal,
    tone: "bg-secondary text-muted-foreground",
  },
};

export function MovementBadge({ kind, className }: { kind: MovementRowKind; className?: string }) {
  const { label, icon: Icon, tone } = MOVEMENT[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4",
        tone,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2.25} />
      {label}
    </span>
  );
}

export { MOVEMENT as MOVEMENT_META };

const HEALTH: Record<PageHealth, { label: string; tone: string }> = {
  healthy: {
    label: "Healthy",
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  watch: {
    label: "Watch",
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  "at-risk": {
    label: "At risk",
    tone: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
};

export function HealthBadge({ health, className }: { health: PageHealth; className?: string }) {
  const { label, tone } = HEALTH[health];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4",
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Marks a query that met all three quick-win criteria. */
export function QuickWinBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
        className,
      )}
    >
      <Zap className="h-3 w-3 shrink-0" strokeWidth={2.25} />
      Quick Win
    </span>
  );
}
