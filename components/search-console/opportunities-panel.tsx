"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { formatNumber, formatPercent, formatPosition } from "@/lib/format";
import type { QueryOpportunity, SearchBaseline } from "@/lib/search-insights";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { QuickWinBadge } from "./status-badges";

/**
 * Query opportunities, with quick wins flagged.
 *
 * A quick win is the *intersection* of three signals — position 8–20,
 * above-average impressions, below-average CTR. Each alone lists half the site;
 * together they identify a term with demonstrated demand, demonstrated ranking
 * ability, and an unclaimed gap between the two.
 */

const columns: ColumnDef<QueryOpportunity, any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  {
    accessorKey: "keyword",
    header: "Keyword",
    cell: ({ row }) => (
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="block max-w-[180px] truncate font-medium sm:max-w-[300px]"
          title={row.original.keyword}
        >
          {row.original.keyword}
        </span>
        {row.original.isQuickWin && <QuickWinBadge />}
      </div>
    ),
    meta: { align: "left" },
  },
  {
    accessorKey: "position",
    header: "Position",
    cell: ({ getValue }) => formatPosition(getValue<number>()),
    meta: { align: "right" },
  },
  {
    accessorKey: "impressions",
    header: "Impressions",
    cell: ({ getValue }) => formatNumber(getValue<number>()),
    meta: { align: "right" },
  },
  {
    accessorKey: "ctr",
    header: "CTR",
    cell: ({ row }) => (
      <span className="tabular">
        {formatPercent(row.original.ctr, 2)}
        <span className="ml-1 text-muted-foreground">
          / {formatPercent(row.original.expectedCtr, 2)}
        </span>
      </span>
    ),
    meta: { align: "right", className: "hidden md:table-cell" },
  },
  {
    accessorKey: "potentialClicks",
    header: "Potential",
    cell: ({ getValue }) => (
      <span className="font-medium tabular">+{formatNumber(getValue<number>())}</span>
    ),
    meta: { align: "right" },
  },
];

export function OpportunitiesPanel({
  opportunities,
  baseline,
  className,
}: {
  opportunities: QueryOpportunity[];
  baseline: SearchBaseline;
  className?: string;
}) {
  const [quickWinsOnly, setQuickWinsOnly] = React.useState(false);

  const quickWins = React.useMemo(
    () => opportunities.filter((o) => o.isQuickWin),
    [opportunities],
  );
  const rows = quickWinsOnly ? quickWins : opportunities;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">Query opportunities</h3>
          <p className="text-[13px] text-muted-foreground">
            Site averages: {formatPercent(baseline.averageCtr, 2)} CTR ·{" "}
            {formatNumber(Math.round(baseline.averageImpressions))} impressions per query.
          </p>
        </div>
        <Badge variant="outline">{quickWins.length} quick wins</Badge>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search keywords…"
        searchKeys={["keyword"]}
        pageSize={10}
        initialSort={[{ id: "potentialClicks", desc: true }]}
        emptyTitle="No opportunities found"
        emptyDescription="No query in this window has enough impressions to judge. Try a wider date range."
        toolbar={
          <button
            type="button"
            onClick={() => setQuickWinsOnly((v) => !v)}
            aria-pressed={quickWinsOnly}
            className={cn(
              "shrink-0 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors",
              quickWinsOnly
                ? "border-transparent bg-secondary text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Quick wins only
          </button>
        }
      />

      <p className="text-[12px] leading-relaxed text-muted-foreground">
        The CTR column shows actual against what this site typically earns at that rank.
        &ldquo;Potential&rdquo; models the clicks available from reaching the top 5 — an estimate
        from that curve, not a forecast.
      </p>
    </div>
  );
}
