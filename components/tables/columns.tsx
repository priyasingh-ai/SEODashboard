"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { PageRow, PortfolioRow, QueryRow } from "@/types";
import {
  formatDuration,
  formatNumber,
  formatPercent,
  formatPosition,
  formatRelativeTime,
} from "@/lib/format";
import { Sparkline } from "@/components/charts/sparkline";
import { TrendBadge } from "@/components/dashboard/trend-badge";

/**
 * Column definitions for every table in the app.
 *
 * `meta.align` drives text alignment and tabular figures in `DataTable`;
 * `meta.className` handles responsive column hiding, so narrow screens drop the
 * least important columns instead of scrolling five of them off-screen.
 */

type Align = { align?: "left" | "right"; className?: string };

/** Right-aligned numeric column — the default shape for a measure. */
function num<T>(
  id: keyof T & string,
  header: string,
  format: (n: number) => string,
  className?: string,
): ColumnDef<T, number> {
  return {
    accessorKey: id,
    header,
    cell: ({ getValue }) => format(getValue()),
    meta: { align: "right", className } satisfies Align,
  };
}

/* -------------------------------------------------------------------------- */
/*  Keywords / Top Queries                                                     */
/* -------------------------------------------------------------------------- */

export const queryColumns: ColumnDef<QueryRow, any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  {
    accessorKey: "keyword",
    header: "Keyword",
    cell: ({ getValue }) => (
      <span className="block max-w-[240px] truncate font-medium sm:max-w-[360px]" title={getValue<string>()}>
        {getValue<string>()}
      </span>
    ),
    meta: { align: "left" } satisfies Align,
  },
  num<QueryRow>("clicks", "Clicks", formatNumber),
  num<QueryRow>("impressions", "Impressions", formatNumber, "hidden sm:table-cell"),
  {
    accessorKey: "ctr",
    header: "CTR",
    cell: ({ getValue }) => formatPercent(getValue<number>(), 2),
    meta: { align: "right", className: "hidden sm:table-cell" } satisfies Align,
  },
  {
    accessorKey: "position",
    header: "Position",
    cell: ({ getValue }) => formatPosition(getValue<number>()),
    meta: { align: "right", className: "hidden md:table-cell" } satisfies Align,
  },
];

/** Keywords page adds a trend cell — a sparkline plus the signed delta. */
export const keywordColumns: ColumnDef<QueryRow, any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  ...queryColumns,
  {
    id: "trend",
    accessorFn: (row) => row.trend,
    header: "Trend",
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-2">
        <span className="hidden w-14 lg:block">
          <Sparkline data={row.original.spark} strokeWidth={1.25} area={false} />
        </span>
        <TrendBadge change={row.original.trend} bare />
      </div>
    ),
    meta: { align: "right" } satisfies Align,
  },
];

/* -------------------------------------------------------------------------- */
/*  Top Pages / Landing Pages                                                  */
/* -------------------------------------------------------------------------- */

function PageCell({ path }: { path: string }) {
  return (
    <span className="block max-w-[220px] truncate font-medium sm:max-w-[340px]" title={path}>
      {path}
    </span>
  );
}

export const topPageColumns: ColumnDef<PageRow, any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  {
    accessorKey: "page",
    header: "Landing Page",
    cell: ({ getValue }) => <PageCell path={getValue<string>()} />,
    meta: { align: "left" } satisfies Align,
  },
  num<PageRow>("clicks", "Clicks", formatNumber),
  num<PageRow>("impressions", "Impressions", formatNumber, "hidden sm:table-cell"),
  {
    accessorKey: "ctr",
    header: "CTR",
    cell: ({ getValue }) => formatPercent(getValue<number>(), 2),
    meta: { align: "right", className: "hidden sm:table-cell" } satisfies Align,
  },
  {
    accessorKey: "position",
    header: "Position",
    cell: ({ getValue }) => formatPosition(getValue<number>()),
    meta: { align: "right", className: "hidden md:table-cell" } satisfies Align,
  },
];

/** The full landing-pages table joins Search Console and GA4 columns. */
export const landingPageColumns: ColumnDef<PageRow, any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  {
    accessorKey: "page",
    header: "Landing Page",
    cell: ({ getValue }) => <PageCell path={getValue<string>()} />,
    meta: { align: "left" } satisfies Align,
  },
  num<PageRow>("users", "Users", formatNumber),
  num<PageRow>("sessions", "Sessions", formatNumber, "hidden sm:table-cell"),
  num<PageRow>("clicks", "Clicks", formatNumber),
  num<PageRow>("impressions", "Impressions", formatNumber, "hidden lg:table-cell"),
  {
    accessorKey: "ctr",
    header: "CTR",
    cell: ({ getValue }) => formatPercent(getValue<number>(), 2),
    meta: { align: "right", className: "hidden md:table-cell" } satisfies Align,
  },
  {
    accessorKey: "position",
    header: "Position",
    cell: ({ getValue }) => formatPosition(getValue<number>()),
    meta: { align: "right", className: "hidden md:table-cell" } satisfies Align,
  },
  {
    accessorKey: "avgEngagementTime",
    header: "Avg. Engagement",
    cell: ({ getValue }) => formatDuration(getValue<number>()),
    meta: { align: "right", className: "hidden xl:table-cell" } satisfies Align,
  },
];

/* -------------------------------------------------------------------------- */
/*  Portfolio summary                                                          */
/* -------------------------------------------------------------------------- */

export function portfolioColumns(query: string): ColumnDef<PortfolioRow, any>[] { // eslint-disable-line @typescript-eslint/no-explicit-any
  return [
    {
      id: "website",
      accessorFn: (row) => row.site.name,
      header: "Website",
      cell: ({ row }) => (
        <Link
          href={`/site/${row.original.site.id}${query ? `?${query}` : ""}`}
          className="group flex items-center gap-2.5"
          // The row itself is clickable; stop this from firing the handler twice.
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-[10px] font-semibold">
            {row.original.site.initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium group-hover:underline">
              {row.original.site.name}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {row.original.site.domain}
            </span>
          </span>
        </Link>
      ),
      meta: { align: "left" } satisfies Align,
    },
    {
      id: "clicks",
      accessorFn: (row) => row.metrics.clicks.current,
      header: "Clicks",
      cell: ({ getValue }) => formatNumber(getValue<number>()),
      meta: { align: "right" } satisfies Align,
    },
    {
      id: "impressions",
      accessorFn: (row) => row.metrics.impressions.current,
      header: "Impressions",
      cell: ({ getValue }) => formatNumber(getValue<number>()),
      meta: { align: "right", className: "hidden sm:table-cell" } satisfies Align,
    },
    {
      id: "users",
      accessorFn: (row) => row.metrics.users.current,
      header: "Users",
      cell: ({ getValue }) => formatNumber(getValue<number>()),
      meta: { align: "right" } satisfies Align,
    },
    {
      id: "sessions",
      accessorFn: (row) => row.metrics.sessions.current,
      header: "Sessions",
      cell: ({ getValue }) => formatNumber(getValue<number>()),
      meta: { align: "right", className: "hidden md:table-cell" } satisfies Align,
    },
    {
      id: "ctr",
      accessorFn: (row) => row.metrics.ctr.current,
      header: "CTR",
      cell: ({ getValue }) => formatPercent(getValue<number>(), 2),
      meta: { align: "right", className: "hidden sm:table-cell" } satisfies Align,
    },
    {
      id: "position",
      accessorFn: (row) => row.metrics.position.current,
      header: "Position",
      cell: ({ getValue }) => formatPosition(getValue<number>()),
      meta: { align: "right", className: "hidden md:table-cell" } satisfies Align,
    },
    {
      id: "weeklyChange",
      accessorFn: (row) => row.weeklyGrowth,
      header: "Weekly Change",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <span className="hidden w-14 xl:block">
            <Sparkline data={row.original.metrics.clicks.spark} strokeWidth={1.25} area={false} />
          </span>
          <TrendBadge change={row.original.weeklyGrowth} />
        </div>
      ),
      meta: { align: "right" } satisfies Align,
    },
    {
      id: "lastUpdated",
      accessorFn: (row) => row.site.lastSync,
      header: "Last Updated",
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">
          {formatRelativeTime(getValue<string>(), new Date().toISOString())}
        </span>
      ),
      meta: { align: "right", className: "hidden lg:table-cell" } satisfies Align,
    },
  ];
}
