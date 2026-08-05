import {
  ArrowDownRight,
  MousePointerClick,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { formatCompact } from "@/lib/format";
import type { ActionSummary } from "@/lib/actions";

/**
 * The at-a-glance count, above the cards.
 *
 * Answers "is there anything I need to deal with today, and roughly how much is
 * it worth" before any scrolling. Every tile is a live count from the same
 * summary object the cards are built from — nothing here is computed twice.
 */

interface Tile {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Emphasis for the things that represent lost ground. */
  tone?: "negative" | "positive";
}

export function SummaryWidget({
  summary,
  className,
}: {
  summary: ActionSummary;
  className?: string;
}) {
  const { byCategory } = summary;

  const tiles: Tile[] = [
    { label: "High priority tasks", value: summary.high, icon: Target, tone: summary.high > 0 ? "negative" : undefined },
    { label: "Rankings dropped", value: byCategory["position-drop"], icon: ArrowDownRight, tone: "negative" },
    { label: "Losing impressions", value: byCategory["losing-impressions"], icon: TrendingDown, tone: "negative" },
    { label: "Ready for page one", value: byCategory["striking-distance"], icon: Target },
    { label: "Quick CTR wins", value: byCategory["ctr-gap"], icon: MousePointerClick },
    { label: "Keywords growing", value: byCategory["rising-query"] + byCategory["new-keyword"], icon: TrendingUp, tone: "positive" },
  ];

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-5">
        <div className="space-y-1">
          <h2 className="text-[15px] font-semibold tracking-tight">Today&rsquo;s summary</h2>
          <p className="text-[13px] text-muted-foreground">
            {summary.total === 0
              ? "Nothing needs attention in this window."
              : `${summary.total} ${summary.total === 1 ? "action" : "actions"} found, sorted by priority.`}
          </p>
        </div>

        {summary.estimatedClicks > 0 && (
          <div className="text-right">
            <div className="text-xl font-semibold tracking-tight tabular">
              {formatCompact(summary.estimatedClicks)}
            </div>
            <div className="text-[11px] text-muted-foreground">clicks on the table</div>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 divide-border sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="flex items-center gap-2.5 border-b border-r border-border p-4 last:border-r-0 sm:border-b-0"
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border",
                tile.value === 0
                  ? "bg-secondary text-muted-foreground"
                  : tile.tone === "negative"
                    ? "border-transparent bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                    : tile.tone === "positive"
                      ? "border-transparent bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                      : "bg-secondary text-foreground",
              )}
            >
              <tile.icon className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <dd className="text-base font-semibold leading-tight tabular">{tile.value}</dd>
              <dt className="truncate text-[11px] leading-tight text-muted-foreground">
                {tile.label}
              </dt>
            </div>
          </div>
        ))}
      </dl>
    </Card>
  );
}
