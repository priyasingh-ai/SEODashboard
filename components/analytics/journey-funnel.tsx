"use client";

import { Info } from "lucide-react";
import type { JourneyStage } from "@/types";
import { formatCompact, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/empty-state";

/**
 * The aggregate journey funnel.
 *
 * Stages, not paths — and the panel says so rather than letting the shape imply
 * otherwise. GA4's Data API exposes no page-to-page sequence data; path
 * exploration exists only in the GA4 UI and in an unstable v1alpha endpoint. A
 * Sankey diagram here would look authoritative and be fabricated.
 *
 * Each bar is drawn to its share of the first stage, so the narrowing is
 * proportional and the biggest fall-off is visible without reading numbers.
 */
export function JourneyFunnel({
  stages,
  className,
}: {
  stages: JourneyStage[];
  className?: string;
}) {
  if (stages.length === 0) {
    return <EmptyState inset title="No journey data" description="Analytics reported no sessions in this period." />;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-2.5">
        {stages.map((stage, i) => (
          <div key={stage.stage}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium">{stage.stage}</span>
              <span className="text-[13px] tabular">
                {formatCompact(stage.value)}
                <span className="ml-1.5 text-muted-foreground">
                  {formatPercent(stage.share, 0)} of users
                </span>
              </span>
            </div>

            <div className="mt-1 h-7 w-full overflow-hidden rounded-md bg-secondary">
              <div
                className="h-full rounded-md bg-primary/85 transition-[width] duration-500"
                style={{ width: `${Math.max(1.5, Math.min(100, stage.share * 100))}%` }}
              />
            </div>

            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">{stage.description}</span>
              {i > 0 && (
                <span
                  className={cn(
                    "text-[11px] font-medium tabular",
                    stage.stepRate < 0.4
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground",
                  )}
                >
                  {formatPercent(stage.stepRate, 0)} continue from {stages[i - 1].stage.toLowerCase()}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="flex items-start gap-1.5 rounded-lg border border-border bg-secondary/40 p-2.5 text-[12px] leading-relaxed text-muted-foreground">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        <span>
          These are aggregate stages, not navigation paths. The Analytics Data API does not
          expose page-to-page sequences — that report exists only inside the GA4 interface — so
          this shows where visitors fall away, not which routes they took.
        </span>
      </p>
    </div>
  );
}
