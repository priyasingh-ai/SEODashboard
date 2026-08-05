"use client";

import { CircleSlash, FileWarning } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { formatNumber, formatPercent, formatPosition, truncatePath } from "@/lib/format";
import { cn } from "@/lib/utils";
import { scoreBand } from "@/lib/content/scoring";
import type { ContentPageRow, IndexStatus } from "@/lib/content/types";

/**
 * Columns for the content health table.
 *
 * Every column has an `accessorKey`, so all of them sort through TanStack
 * without bespoke code. Lower-priority columns hide progressively on narrow
 * screens rather than forcing a horizontal scroll through thirteen of them.
 */

const INDEX_TONE: Record<IndexStatus, string> = {
  indexed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  "not-indexed": "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  blocked: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  unknown: "bg-secondary text-muted-foreground",
};

const INDEX_LABEL: Record<IndexStatus, string> = {
  indexed: "Indexed",
  "not-indexed": "Not indexed",
  blocked: "Blocked",
  unknown: "Unknown",
};

export function IndexBadge({ status, detail }: { status: IndexStatus; detail?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4",
        INDEX_TONE[status],
      )}
      title={detail}
    >
      {INDEX_LABEL[status]}
    </span>
  );
}

/** Shared 0–100 pill for the two composite scores. */
export function ScorePill({ score, className }: { score: number; className?: string }) {
  const band = scoreBand(score);
  return (
    <span
      className={cn(
        "inline-flex min-w-[34px] items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular",
        band === "good"
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
          : band === "fair"
            ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
            : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
        className,
      )}
    >
      {score}
    </span>
  );
}

const num = (n: number) => formatNumber(n);

const UNMEASURABLE =
  "Not measurable — this page renders its content with JavaScript, which this scan does not execute";

/** JS-shell rows are shown as unknown, and their scores are not meaningful. */
function unmeasurable(row: ContentPageRow): boolean {
  return Boolean(row.fetchError || row.clientRendered);
}

export const contentColumns: ColumnDef<ContentPageRow, any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  {
    accessorKey: "path",
    header: "Page",
    cell: ({ row }) => (
      <div className="flex min-w-0 items-center gap-1.5">
        {row.original.fetchError && (
          <FileWarning
            className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400"
            strokeWidth={2}
          />
        )}
        <span
          className="block max-w-[180px] truncate font-medium sm:max-w-[260px]"
          title={row.original.fetchError ? `${row.original.path} — ${row.original.fetchError}` : row.original.path}
        >
          {truncatePath(row.original.path, 42)}
        </span>
      </div>
    ),
    meta: { align: "left" },
  },
  {
    accessorKey: "indexStatus",
    header: "Index",
    cell: ({ row }) => <IndexBadge status={row.original.indexStatus} detail={row.original.indexDetail} />,
    meta: { align: "left" },
  },
  { accessorKey: "clicks", header: "Clicks", cell: ({ getValue }) => num(getValue<number>()), meta: { align: "right" } },
  {
    accessorKey: "impressions",
    header: "Impr.",
    cell: ({ getValue }) => num(getValue<number>()),
    meta: { align: "right" },
  },
  {
    accessorKey: "ctr",
    header: "CTR",
    cell: ({ getValue }) => formatPercent(getValue<number>(), 2),
    meta: { align: "right", className: "hidden sm:table-cell" },
  },
  {
    accessorKey: "position",
    header: "Pos.",
    cell: ({ getValue }) => formatPosition(getValue<number>()),
    meta: { align: "right", className: "hidden sm:table-cell" },
  },
  {
    accessorKey: "wordCount",
    header: "Words",
    cell: ({ row }) =>
      // Unknown, not zero — see `clientRendered`.
      row.original.fetchError || row.original.clientRendered ? (
        <span className="text-muted-foreground" title={UNMEASURABLE}>
          —
        </span>
      ) : (
        <span className={cn(row.original.wordCount < 300 && "text-amber-600 dark:text-amber-400")}>
          {num(row.original.wordCount)}
        </span>
      ),
    meta: { align: "right", className: "hidden md:table-cell" },
  },
  {
    accessorKey: "lastUpdated",
    header: "Updated",
    cell: ({ row }) =>
      row.original.lastUpdated ? (
        <span title={`Source: ${row.original.lastUpdatedSource}`}>{row.original.lastUpdated}</span>
      ) : (
        <span className="text-muted-foreground" title="The page declares no modified date">
          —
        </span>
      ),
    meta: { align: "right", className: "hidden lg:table-cell" },
  },
  {
    accessorKey: "inboundLinks",
    header: "Links in",
    cell: ({ row }) =>
      row.original.fetchError || row.original.clientRendered ? (
        <span className="text-muted-foreground" title={UNMEASURABLE}>
          —
        </span>
      ) : (
        <span
          className={cn(row.original.inboundLinks === 0 && "text-amber-600 dark:text-amber-400")}
          title={`${row.original.inboundLinks} inbound (within the scanned sample) · ${row.original.outboundLinks} outbound`}
        >
          {row.original.inboundLinks}
          <span className="text-muted-foreground"> / {row.original.outboundLinks}</span>
        </span>
      ),
    meta: { align: "right", className: "hidden lg:table-cell" },
  },
  {
    accessorKey: "schemaTypes",
    header: "Schema",
    // Sort on presence and count rather than the array identity.
    accessorFn: (row) => (row.schemaValid ? row.schemaTypes.length : -1),
    cell: ({ row }) =>
      row.original.fetchError || row.original.clientRendered ? (
        <span className="text-muted-foreground" title={UNMEASURABLE}>
          —
        </span>
      ) : !row.original.schemaValid ? (
        <span className="text-red-600 dark:text-red-400">Invalid</span>
      ) : row.original.schemaTypes.length === 0 ? (
        <CircleSlash className="ml-auto h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
      ) : (
        <span className="truncate" title={row.original.schemaTypes.join(", ")}>
          {row.original.schemaTypes[0]}
          {row.original.schemaTypes.length > 1 && ` +${row.original.schemaTypes.length - 1}`}
        </span>
      ),
    meta: { align: "right", className: "hidden xl:table-cell" },
  },
  {
    accessorKey: "freshnessScore",
    header: "Fresh",
    cell: ({ getValue }) => <ScorePill score={getValue<number>()} />,
    meta: { align: "right", className: "hidden md:table-cell" },
  },
  {
    accessorKey: "aiReadinessScore",
    header: "AI ready",
    cell: ({ row }) =>
      unmeasurable(row.original) ? (
        <span className="text-muted-foreground" title={UNMEASURABLE}>
          —
        </span>
      ) : (
        <ScorePill score={row.original.aiReadinessScore} />
      ),
    meta: { align: "right", className: "hidden md:table-cell" },
  },
  {
    id: "suggestions",
    header: "Fixes",
    accessorFn: (row) => row.suggestions.length,
    cell: ({ getValue }) => {
      const count = getValue<number>();
      return count === 0 ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="font-medium tabular">{count}</span>
      );
    },
    meta: { align: "right" },
  },
];
