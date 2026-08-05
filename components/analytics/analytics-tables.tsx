"use client";

import * as React from "react";
import { Info } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type {
  AcquisitionRow,
  AudienceSplitRow,
  ConversionSummary,
  DropOffRow,
  PagePerformanceRow,
} from "@/types";
import {
  formatCompact,
  formatDuration,
  formatNumber,
  formatPercent,
  truncatePath,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/tables/data-table";
import { TrendBadge } from "@/components/dashboard/trend-badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";

/**
 * The Analytics tables.
 *
 * All five share `DataTable`, so sorting, search and pagination behave the same
 * here as everywhere else in the app. Only the column definitions differ.
 */

/* -------------------------------------------------------------------------- */
/*  Shared cells                                                               */
/* -------------------------------------------------------------------------- */

function ShareCell({ share }: { share: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-secondary sm:block">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, Math.round(share * 100))}%` }}
        />
      </div>
      <span className="tabular">{formatPercent(share, 1)}</span>
    </div>
  );
}

/** Score pill — green at the top of the range, red at the bottom. */
function ScoreCell({ score }: { score: number }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[38px] items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular",
        score >= 65
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
          : score >= 40
            ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
            : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
      )}
    >
      {score}
    </span>
  );
}

function PageCell({ page }: { page: string }) {
  return (
    <span className="block max-w-[200px] truncate font-medium sm:max-w-[320px]" title={page}>
      {truncatePath(page, 48)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Traffic sources                                                            */
/* -------------------------------------------------------------------------- */

const acquisitionColumns: ColumnDef<AcquisitionRow, any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  {
    accessorKey: "label",
    header: "Source",
    cell: ({ getValue }) => (
      <span className="block max-w-[180px] truncate font-medium sm:max-w-[280px]" title={getValue<string>()}>
        {getValue<string>()}
      </span>
    ),
    meta: { align: "left" },
  },
  { accessorKey: "sessions", header: "Sessions", cell: ({ getValue }) => formatNumber(getValue<number>()), meta: { align: "right" } },
  { accessorKey: "share", header: "Share", cell: ({ getValue }) => <ShareCell share={getValue<number>()} />, meta: { align: "right" } },
  { accessorKey: "users", header: "Users", cell: ({ getValue }) => formatNumber(getValue<number>()), meta: { align: "right", className: "hidden sm:table-cell" } },
  {
    accessorKey: "engagementRate",
    header: "Engagement",
    cell: ({ getValue }) => formatPercent(getValue<number>(), 1),
    meta: { align: "right", className: "hidden md:table-cell" },
  },
  { accessorKey: "trend", header: "Trend", cell: ({ getValue }) => <TrendBadge change={getValue<number>()} />, meta: { align: "right" } },
];

export function AcquisitionTable({
  rows,
  searchable,
}: {
  rows: AcquisitionRow[];
  searchable?: boolean;
}) {
  return (
    <DataTable
      columns={acquisitionColumns}
      data={rows}
      pageSize={searchable ? 10 : 8}
      paginate={searchable}
      searchPlaceholder={searchable ? "Search sources…" : undefined}
      searchKeys={searchable ? ["label"] : undefined}
      initialSort={[{ id: "sessions", desc: true }]}
      emptyTitle="No traffic data"
      emptyDescription="Analytics reported no sessions for this property in the selected range."
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Page performance                                                           */
/* -------------------------------------------------------------------------- */

const pageColumns: ColumnDef<PagePerformanceRow, any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  { accessorKey: "page", header: "Page", cell: ({ getValue }) => <PageCell page={getValue<string>()} />, meta: { align: "left" } },
  { accessorKey: "score", header: "Score", cell: ({ getValue }) => <ScoreCell score={getValue<number>()} />, meta: { align: "right" } },
  { accessorKey: "views", header: "Views", cell: ({ getValue }) => formatNumber(getValue<number>()), meta: { align: "right" } },
  { accessorKey: "users", header: "Users", cell: ({ getValue }) => formatNumber(getValue<number>()), meta: { align: "right", className: "hidden sm:table-cell" } },
  {
    accessorKey: "engagementRate",
    header: "Engagement",
    cell: ({ getValue }) => formatPercent(getValue<number>(), 1),
    meta: { align: "right" },
  },
  {
    accessorKey: "avgEngagementTime",
    header: "Avg. time",
    cell: ({ getValue }) => formatDuration(Math.round(getValue<number>())),
    meta: { align: "right", className: "hidden md:table-cell" },
  },
];

export function PagePerformanceTable({
  rows,
  variant,
}: {
  rows: PagePerformanceRow[];
  variant: "top" | "worst";
}) {
  // Same data, opposite ends. Sorting here rather than keeping two arrays means
  // the score that ranks them is provably the same in both directions.
  const ordered = React.useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.score - a.score || b.views - a.views);
    return variant === "top" ? sorted.slice(0, 10) : sorted.slice(-10).reverse();
  }, [rows, variant]);

  return (
    <DataTable
      columns={pageColumns}
      data={ordered}
      paginate={false}
      pageSize={10}
      emptyTitle="No page data"
      emptyDescription="No page passed the minimum view threshold in this period."
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Drop-off                                                                   */
/* -------------------------------------------------------------------------- */

const dropOffColumns: ColumnDef<DropOffRow, any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  { accessorKey: "page", header: "Landing page", cell: ({ getValue }) => <PageCell page={getValue<string>()} />, meta: { align: "left" } },
  { accessorKey: "sessions", header: "Sessions", cell: ({ getValue }) => formatNumber(getValue<number>()), meta: { align: "right" } },
  {
    accessorKey: "lostSessions",
    header: "Left without engaging",
    cell: ({ getValue }) => <span className="font-medium tabular">{formatNumber(getValue<number>())}</span>,
    meta: { align: "right" },
  },
  {
    accessorKey: "bounceRate",
    header: "Bounce rate",
    cell: ({ getValue }) => formatPercent(getValue<number>(), 1),
    meta: { align: "right", className: "hidden sm:table-cell" },
  },
  {
    accessorKey: "avgSessionDuration",
    header: "Avg. duration",
    cell: ({ getValue }) => formatDuration(Math.round(getValue<number>())),
    meta: { align: "right", className: "hidden md:table-cell" },
  },
];

export function DropOffTable({ rows }: { rows: DropOffRow[] }) {
  return (
    <div className="space-y-3">
      <DataTable
        columns={dropOffColumns}
        data={rows}
        searchPlaceholder="Search landing pages…"
        searchKeys={["page"]}
        pageSize={10}
        initialSort={[{ id: "lostSessions", desc: true }]}
        emptyTitle="No drop-off data"
        emptyDescription="No landing page passed the minimum session threshold in this period."
      />
      <p className="flex items-start gap-1.5 rounded-lg border border-border bg-secondary/40 p-2.5 text-[12px] leading-relaxed text-muted-foreground">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        <span>
          These are <strong className="font-medium">drop-off</strong> pages, not exit pages.
          Google Analytics 4 removed the <code className="rounded bg-muted px-1 text-[11px]">exits</code>{" "}
          metric — its Data API rejects the request outright — so this ranks landing pages by
          sessions that arrived and left without engaging, which is the closest measure the API
          supports. It answers &ldquo;where are visits dying&rdquo;, not &ldquo;which page was
          seen last&rdquo;.
        </span>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Conversions                                                                */
/* -------------------------------------------------------------------------- */

export function ConversionsPanel({ conversions }: { conversions: ConversionSummary }) {
  if (conversions.notConfigured) {
    return (
      <EmptyState
        title="No key events configured"
        description="Nothing on this GA4 property is marked as a key event, so there are no conversions to measure. In GA4 open Admin → Events and switch on “Mark as key event” for the actions that matter. Data is collected from that point on and is not backfilled."
      />
    );
  }

  const columns: ColumnDef<ConversionSummary["events"][number], any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
    { accessorKey: "eventName", header: "Event", cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>, meta: { align: "left" } },
    { accessorKey: "keyEvents", header: "Key events", cell: ({ getValue }) => formatNumber(getValue<number>()), meta: { align: "right" } },
    { accessorKey: "eventCount", header: "Total fires", cell: ({ getValue }) => formatNumber(getValue<number>()), meta: { align: "right", className: "hidden sm:table-cell" } },
    { accessorKey: "trend", header: "Trend", cell: ({ getValue }) => <TrendBadge change={getValue<number>()} />, meta: { align: "right" } },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="text-[11px] text-muted-foreground">Key events</div>
          <div className="mt-0.5 text-xl font-semibold tracking-tight tabular">
            {formatCompact(conversions.keyEvents)}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="text-[11px] text-muted-foreground">Session conversion rate</div>
          <div className="mt-0.5 text-xl font-semibold tracking-tight tabular">
            {formatPercent(conversions.keyEventRate, 2)}
          </div>
        </div>
        {conversions.revenue > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="text-[11px] text-muted-foreground">Revenue</div>
            <div className="mt-0.5 text-xl font-semibold tracking-tight tabular">
              {formatCompact(conversions.revenue)}
            </div>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={conversions.events}
        paginate={false}
        emptyTitle="No key events fired"
        emptyDescription="Key events are configured on this property but none were triggered in this period."
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Audience                                                                   */
/* -------------------------------------------------------------------------- */

export function AudienceSplit({ rows }: { rows: AudienceSplitRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium">{row.label} visitors</span>
            <Badge variant="outline">{formatPercent(row.share, 0)}</Badge>
          </div>
          <div className="mt-1 text-xl font-semibold tracking-tight tabular">
            {formatCompact(row.users)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {formatCompact(row.sessions)} sessions · {formatPercent(row.engagementRate, 1)} engaged
          </div>
        </div>
      ))}
    </div>
  );
}
