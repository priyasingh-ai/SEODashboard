"use client";

import { Lightbulb, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { AnalyticsNarrative, InsightTone } from "@/lib/analytics-narrative";

/**
 * One generated insight.
 *
 * The card separates the observation from the suggestion visually, because they
 * carry different weight: the headline and detail are arithmetic on the data and
 * can be checked, while the recommendation is a judgement call. Blurring the two
 * would invite the reader to trust both equally.
 */

const TONE: Record<InsightTone, { icon: LucideIcon; chip: string; ring: string }> = {
  positive: {
    icon: TrendingUp,
    chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    ring: "border-emerald-200/70 dark:border-emerald-500/20",
  },
  negative: {
    icon: TrendingDown,
    chip: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    ring: "border-red-200/70 dark:border-red-500/20",
  },
  neutral: {
    icon: Minus,
    chip: "bg-secondary text-muted-foreground",
    ring: "border-border",
  },
};

export function InsightCard({
  insight,
  className,
}: {
  insight: AnalyticsNarrative;
  className?: string;
}) {
  const tone = TONE[insight.tone];
  const Icon = tone.icon;

  return (
    <Card className={cn("flex flex-col gap-3 p-5", tone.ring, className)}>
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            tone.chip,
          )}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-[13px] font-medium leading-relaxed">{insight.headline}</p>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{insight.detail}</p>
        </div>
      </div>

      {insight.evidence.length > 0 && (
        <dl className="grid grid-cols-3 gap-2 rounded-lg border border-border p-2.5">
          {insight.evidence.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="truncate text-[11px] text-muted-foreground">{item.label}</dt>
              <dd className="truncate text-[12px] font-medium tabular" title={item.value}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {insight.recommendation && (
        <div className="mt-auto rounded-lg border border-border bg-secondary/40 p-3">
          <div className="flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Recommended action
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed">{insight.recommendation}</p>
        </div>
      )}
    </Card>
  );
}
