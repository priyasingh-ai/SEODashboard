"use client";

import * as React from "react";
import { Info } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type {
  KeywordMovementRow,
  MovementKind,
  MovementRowKind,
  MovementWindow,
} from "@/types";
import type { KeywordMovementData } from "@/services/types";
import { MOVEMENT_WINDOW_LABELS, formatRange } from "@/lib/date-range";
import { formatNumber, formatPosition } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/tables/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MovementBadge, MOVEMENT_META } from "./status-badges";

/**
 * Keyword movement between two windows.
 *
 * The window selector is local to this panel rather than wired to the page's
 * date range: movement is a "what changed lately" question with its own natural
 * periods, and tying it to the range picker would make day-over-day unavailable
 * whenever someone was looking at a longer window.
 */

const WINDOWS: MovementWindow[] = ["day", "week", "month"];
const KINDS: MovementKind[] = ["improved", "dropped", "new", "lost"];

/**
 * Rank delta cell. Negative is an improvement, so the sign is inverted for
 * colour.
 *
 * Presence is read off the position itself — Search Console never reports rank
 * 0, so a zero means the keyword did not rank in that window. That covers new
 * and lost rows without special-casing them, and it also covers the stable row
 * that appeared this window but was too quiet to be called new.
 */
function PositionCell({ row }: { row: { kind: MovementRowKind; position: number; prevPosition: number; positionDelta: number } }) {
  const before = row.prevPosition > 0 ? formatPosition(row.prevPosition) : "—";
  const after = row.position > 0 ? formatPosition(row.position) : "—";
  // A delta is only shown where it was the reason for the classification.
  // Stable rows do drift by fractions of a place, and printing that in red or
  // green would dress up noise as a result.
  const showDelta = row.kind === "improved" || row.kind === "dropped";

  return (
    <span className="tabular">
      {before} → {after}
      {showDelta && (
        <span
          className={cn(
            "ml-1.5 font-medium",
            row.positionDelta < 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400",
          )}
        >
          {row.positionDelta < 0 ? "▲" : "▼"}
          {Math.abs(row.positionDelta).toFixed(1)}
        </span>
      )}
    </span>
  );
}

const columns: ColumnDef<KeywordMovementRow, any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  {
    accessorKey: "keyword",
    header: "Keyword",
    cell: ({ getValue }) => (
      <span
        className="block max-w-[200px] truncate font-medium sm:max-w-[320px]"
        title={getValue<string>()}
      >
        {getValue<string>()}
      </span>
    ),
    meta: { align: "left" },
  },
  {
    accessorKey: "kind",
    header: "Change",
    cell: ({ getValue }) => <MovementBadge kind={getValue<MovementRowKind>()} />,
    meta: { align: "left" },
  },
  {
    accessorKey: "positionDelta",
    header: "Position",
    cell: ({ row }) => <PositionCell row={row.original} />,
    meta: { align: "right" },
  },
  {
    accessorKey: "clicks",
    header: "Clicks",
    cell: ({ row }) => (
      <span className="tabular">
        {formatNumber(row.original.prevClicks)} → {formatNumber(row.original.clicks)}
      </span>
    ),
    meta: { align: "right", className: "hidden sm:table-cell" },
  },
  {
    accessorKey: "impressions",
    header: "Impressions",
    cell: ({ getValue }) => formatNumber(getValue<number>()),
    meta: { align: "right", className: "hidden md:table-cell" },
  },
];

export function MovementPanel({
  data,
  isLoading,
  window,
  onWindowChange,
}: {
  data: KeywordMovementData | undefined;
  isLoading: boolean;
  window: MovementWindow;
  onWindowChange: (window: MovementWindow) => void;
}) {
  const [kind, setKind] = React.useState<MovementKind | "all">("all");

  // Unfiltered, the table lists every keyword that ranked in this window —
  // movers first, then the ones that held. Picking a bucket narrows to that
  // bucket, so the stable rows are only ever in the way of someone browsing
  // "all", where they sit below the movement they came to read.
  const rows = React.useMemo(
    () => (data ? data.rows.filter((r) => kind === "all" || r.kind === kind) : []),
    [data, kind],
  );

  const movedCount = data ? KINDS.reduce((total, k) => total + data.counts[k], 0) : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">Keyword movement</h3>
          <p className="text-[13px] text-muted-foreground">
            {data
              ? `${formatRange(data.range)} vs. ${formatRange(data.previous)}`
              : "Comparing two consecutive windows."}
          </p>
        </div>

        <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
          {WINDOWS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onWindowChange(option)}
              aria-pressed={window === option}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                window === option
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {MOVEMENT_WINDOW_LABELS[option].replace(" over ", "/")}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {KINDS.map((k) => (
            <Skeleton key={k} className="h-[76px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Counts double as the bucket filter — clicking one narrows the table */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {KINDS.map((k) => {
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(active ? "all" : k)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-xl border bg-card p-4 text-left shadow-card transition-colors",
                    active ? "border-foreground/30" : "border-border hover:border-foreground/20",
                  )}
                >
                  <div className="text-xl font-semibold tracking-tight tabular">
                    {data.counts[k]}
                  </div>
                  <MovementBadge kind={k} className="mt-1.5" />
                </button>
              );
            })}
          </div>

          {data.truncated && (
            <p className="flex items-start gap-1.5 rounded-lg border border-border bg-secondary/40 p-2.5 text-[12px] leading-relaxed text-muted-foreground">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span>
                Search Console returned the maximum number of rows for this window, so its
                long tail was cut off. Only keywords ranking above that cut-off can be
                confirmed as genuinely new or lost — quieter terms are excluded rather than
                guessed at.
              </span>
            </p>
          )}

          {movedCount === 0 && (
            <p className="rounded-lg border border-border bg-secondary/40 p-2.5 text-[12px] leading-relaxed text-muted-foreground">
              No keyword changed position, appeared, or disappeared by enough to register in
              this window — try a longer one. Every keyword that ranked is still listed below,
              so you can look one up.
            </p>
          )}

          {data.rows.length === 0 ? (
            <EmptyState
              inset
              title="No keywords in this window"
              description="Search Console returned no queries for these dates. Try a longer window."
            />
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              // Named for what it actually covers. Every keyword in the window
              // is here, not only the movers, so a term visible in Top Queries
              // is always findable — which is the whole reason stable rows are
              // carried.
              searchPlaceholder="Search every keyword in this window…"
              searchKeys={["keyword"]}
              pageSize={10}
              emptyTitle={`No ${kind === "all" ? "" : MOVEMENT_META[kind as MovementKind].label.toLowerCase() + " "}keywords match`}
            />
          )}
        </>
      )}
    </div>
  );
}
