"use client";

import * as React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { SOURCE_LABEL, type Highlight } from "@/lib/copilot";
import { Card } from "@/components/ui/card";

/**
 * A win or a problem.
 *
 * One component for both, differing only in the arrow and its colour. The
 * symmetry is the point: a dashboard that renders good news in a richer, larger
 * treatment than bad news is editorialising through layout, and the reader
 * stops trusting the wins.
 */
export function HighlightCard({
  highlight,
  positive,
}: {
  highlight: Highlight;
  positive: boolean;
}) {
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-2.5">
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            positive
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400",
          )}
          strokeWidth={2}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-relaxed">{highlight.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {highlight.detail}
          </p>

          {highlight.facts.length > 0 && (
            <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
              {highlight.facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-[11px] text-muted-foreground">{fact.label}</dt>
                  <dd className="text-[12px] font-medium tabular">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <p className="mt-2 text-[11px] text-muted-foreground">
            {SOURCE_LABEL[highlight.source]}
          </p>
        </div>
      </div>
    </Card>
  );
}
