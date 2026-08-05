"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { formatNumber, formatPercent, formatPosition, truncatePath } from "@/lib/format";
import type { PageHealth, PageHealthRow } from "@/lib/search-insights";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/tables/data-table";
import { TrendBadge } from "@/components/dashboard/trend-badge";
import { HealthBadge } from "./status-badges";

/**
 * Landing page health.
 *
 * Trend (clicks) and Growth (impressions) get their own columns because they
 * routinely disagree, and the disagreement is the interesting part: impressions
 * up with clicks down is a snippet problem, both down is a visibility problem,
 * and they call for completely different work. One blended "trend" column would
 * hide precisely the case worth acting on.
 */

const columns: ColumnDef<PageHealthRow, any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  {
    accessorKey: "page",
    header: "Page",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span
          className="block max-w-[200px] truncate font-medium sm:max-w-[300px]"
          title={row.original.page}
        >
          {truncatePath(row.original.page, 48)}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground" title={row.original.note}>
          {row.original.note}
        </span>
      </div>
    ),
    meta: { align: "left" },
  },
  {
    accessorKey: "health",
    header: "Health",
    cell: ({ getValue }) => <HealthBadge health={getValue<PageHealth>()} />,
    meta: { align: "left" },
  },
  {
    accessorKey: "clicks",
    header: "Clicks",
    cell: ({ getValue }) => formatNumber(getValue<number>()),
    meta: { align: "right" },
  },
  {
    accessorKey: "impressions",
    header: "Impressions",
    cell: ({ getValue }) => formatNumber(getValue<number>()),
    meta: { align: "right", className: "hidden sm:table-cell" },
  },
  {
    accessorKey: "ctr",
    header: "CTR",
    cell: ({ getValue }) => formatPercent(getValue<number>(), 2),
    meta: { align: "right", className: "hidden lg:table-cell" },
  },
  {
    accessorKey: "position",
    header: "Position",
    cell: ({ getValue }) => formatPosition(getValue<number>()),
    meta: { align: "right", className: "hidden lg:table-cell" },
  },
  {
    accessorKey: "trend",
    header: "Trend",
    cell: ({ getValue }) => <TrendBadge change={getValue<number>()} />,
    meta: { align: "right" },
  },
  {
    accessorKey: "growth",
    header: "Growth",
    cell: ({ getValue }) => <TrendBadge change={getValue<number>()} />,
    meta: { align: "right", className: "hidden md:table-cell" },
  },
];

const FILTERS: { value: PageHealth | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "at-risk", label: "At risk" },
  { value: "watch", label: "Watch" },
  { value: "healthy", label: "Healthy" },
];

export function PageHealthPanel({
  rows,
  className,
}: {
  rows: PageHealthRow[];
  className?: string;
}) {
  const [filter, setFilter] = React.useState<PageHealth | "all">("all");

  const visible = React.useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.health === filter)),
    [rows, filter],
  );

  const counts = React.useMemo(
    () => ({
      all: rows.length,
      "at-risk": rows.filter((r) => r.health === "at-risk").length,
      watch: rows.filter((r) => r.health === "watch").length,
      healthy: rows.filter((r) => r.health === "healthy").length,
    }),
    [rows],
  );

  return (
    <div className={cn("space-y-3", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight">Landing page health</h3>
        <p className="text-[13px] text-muted-foreground">
          Trend tracks clicks; Growth tracks impressions. When they disagree, the gap is the
          finding.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={visible}
        searchPlaceholder="Search pages…"
        searchKeys={["page"]}
        pageSize={10}
        emptyTitle="No pages match"
        emptyDescription="No landing page in this window matches the selected health status."
        toolbar={
          <div className="flex shrink-0 items-center rounded-lg border border-border bg-card p-0.5">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                aria-pressed={filter === option.value}
                className={cn(
                  "rounded-md px-2 py-1 text-[12px] font-medium transition-colors",
                  filter === option.value
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
                <span className="ml-1 text-[11px] text-muted-foreground tabular">
                  {counts[option.value]}
                </span>
              </button>
            ))}
          </div>
        }
      />
    </div>
  );
}
