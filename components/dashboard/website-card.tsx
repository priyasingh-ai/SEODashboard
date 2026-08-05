"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import type { PortfolioRow } from "@/types";
import { formatCompact, formatPercent, formatPosition, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/charts/sparkline";
import { TrendBadge } from "./trend-badge";

interface WebsiteCardProps {
  row: PortfolioRow;
  index?: number;
  /** Preserve the active range/compare filters when opening the site. */
  query?: string;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold tabular">{value}</div>
    </div>
  );
}

/**
 * The portfolio card — one website, at a glance.
 *
 * Layout hierarchy is deliberate: identity (name + domain) on top, the weekly
 * growth number given the most weight because "which site is growing?" is the
 * question this page exists to answer, then the six supporting measures, then
 * the sync freshness footer.
 */
export function WebsiteCard({ row, index = 0, query = "" }: WebsiteCardProps) {
  const { site, metrics, weeklyGrowth } = row;
  const href = `/site/${site.id}${query ? `?${query}` : ""}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.2), ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href={href}
        className={cn(
          "group flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-card transition-all",
          "hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-card-hover",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        {/* Identity */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-xs font-semibold">
              {site.initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight">{site.name}</div>
              <div className="truncate text-xs text-muted-foreground">{site.domain}</div>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>

        {/* The headline: week-over-week growth */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Weekly growth
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-semibold tracking-tight">
                {formatCompact(metrics.clicks.current)}
              </span>
              <TrendBadge change={weeklyGrowth} size="md" />
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">clicks this period</div>
          </div>
          <div className="w-24 shrink-0">
            <Sparkline data={metrics.clicks.spark} />
          </div>
        </div>

        {/* Supporting measures */}
        <div className="grid grid-cols-3 gap-x-3 gap-y-3 border-t border-border pt-4">
          <Stat label="Impr." value={formatCompact(metrics.impressions.current)} />
          <Stat label="Users" value={formatCompact(metrics.users.current)} />
          <Stat label="Sessions" value={formatCompact(metrics.sessions.current)} />
          <Stat label="CTR" value={formatPercent(metrics.ctr.current, 2)} />
          <Stat label="Position" value={formatPosition(metrics.position.current)} />
          <div className="min-w-0">
            <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Synced
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold tabular">
              {formatRelativeTime(site.lastSync, new Date().toISOString())}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
