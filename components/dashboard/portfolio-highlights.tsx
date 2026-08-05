"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, MousePointerClick, Percent, TrendingDown, TrendingUp } from "lucide-react";
import type { PortfolioRow } from "@/types";
import { formatCompact, formatDelta, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface HighlightsProps {
  rows: PortfolioRow[];
  query?: string;
}

/**
 * The 30-second answer row.
 *
 * The brief asks four questions the portfolio has to answer at a glance —
 * who's growing, who dropped, who converts best, who gained the most users.
 * Rather than making you scan four cards and a table for each, this computes
 * them and names the winner outright.
 *
 * Note this is *arithmetic on the data you already see*, not advice — the panel
 * points at a site, it never tells you what to do about it.
 */
export function PortfolioHighlights({ rows, query = "" }: HighlightsProps) {
  const highlights = React.useMemo(() => {
    if (!rows.length) return [];

    const by = <T,>(pick: (r: PortfolioRow) => T, cmp: (a: T, b: T) => number) =>
      [...rows].sort((a, b) => cmp(pick(a), pick(b)))[0];

    const desc = (a: number, b: number) => b - a;
    const asc = (a: number, b: number) => a - b;

    const growing = by((r) => r.weeklyGrowth, desc);
    const dropping = by((r) => r.weeklyGrowth, asc);
    const bestCtr = by((r) => r.metrics.ctr.current, desc);
    const mostUsers = by((r) => r.metrics.users.current - r.metrics.users.previous, desc);

    return [
      {
        icon: TrendingUp,
        label: "Growing fastest",
        site: growing.site,
        value: formatDelta(growing.weeklyGrowth),
        sub: "clicks, week over week",
        tone: "positive" as const,
      },
      {
        // Only frame this as a loss if it actually is one — with every site up,
        // "lost traffic" would be a lie the sort order invented.
        icon: dropping.weeklyGrowth < 0 ? TrendingDown : TrendingUp,
        label: dropping.weeklyGrowth < 0 ? "Lost the most traffic" : "Slowest growth",
        site: dropping.site,
        value: formatDelta(dropping.weeklyGrowth),
        sub: "clicks, week over week",
        tone: dropping.weeklyGrowth < 0 ? ("negative" as const) : ("neutral" as const),
      },
      {
        icon: Percent,
        label: "Highest CTR",
        site: bestCtr.site,
        value: formatPercent(bestCtr.metrics.ctr.current, 2),
        sub: "clicks per impression",
        tone: "neutral" as const,
      },
      {
        icon: MousePointerClick,
        label: "Most users gained",
        site: mostUsers.site,
        value: `+${formatCompact(Math.max(0, mostUsers.metrics.users.current - mostUsers.metrics.users.previous))}`,
        sub: "vs. previous period",
        tone: "neutral" as const,
      },
    ];
  }, [rows]);

  if (!highlights.length) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {highlights.map((item) => (
        <Link
          key={item.label}
          href={`/site/${item.site.id}${query ? `?${query}` : ""}`}
          className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition-all hover:border-foreground/15 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5">
              <item.icon
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  item.tone === "positive" && "text-emerald-600 dark:text-emerald-400",
                  item.tone === "negative" && "text-red-600 dark:text-red-400",
                  item.tone === "neutral" && "text-muted-foreground",
                )}
                strokeWidth={2.25}
              />
              <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {item.label}
              </span>
            </div>
            <div className="truncate text-sm font-semibold tracking-tight">{item.site.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">{item.sub}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                "text-base font-semibold tabular",
                item.tone === "positive" && "text-emerald-700 dark:text-emerald-400",
                item.tone === "negative" && "text-red-700 dark:text-red-400",
              )}
            >
              {item.value}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </Link>
      ))}
    </div>
  );
}
