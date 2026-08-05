import { Lightbulb, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/format";
import { ImpactBadge } from "./priority-badge";
import type { Impact } from "@/lib/actions";

/**
 * The "so what do I do about it" half of an action card.
 *
 * Split out from `ActionCard` because the recommendation is the part most
 * likely to be reused elsewhere — a page detail view, an email digest, a
 * printed report — while the card's header chrome is specific to the grid.
 */

interface RecommendationPanelProps {
  recommendedAction: string;
  impact: Impact;
  /** Modelled additional clicks over the current window. */
  estimatedClicks: number;
  className?: string;
}

export function RecommendationPanel({
  recommendedAction,
  impact,
  estimatedClicks,
  className,
}: RecommendationPanelProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-secondary/40 p-3", className)}>
      <div className="flex items-center gap-1.5">
        <Lightbulb className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Recommended action
        </span>
      </div>

      <p className="mt-1.5 text-[13px] leading-relaxed">{recommendedAction}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
        <ImpactBadge impact={impact} />
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <TrendingUp className="h-3 w-3" strokeWidth={2} />
          {/* "up to" is doing real work: this is a CTR-curve projection, not a forecast. */}
          up to <span className="font-medium tabular">{formatCompact(estimatedClicks)}</span> clicks
        </span>
      </div>
    </div>
  );
}
