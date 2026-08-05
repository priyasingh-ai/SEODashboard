"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatNumber, formatPercent, formatPosition, truncatePath } from "@/lib/format";
import type { CtrFinding, SearchBaseline } from "@/lib/search-insights";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/tables/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";

/**
 * Pages shown often and clicked rarely.
 *
 * Sorted by recoverable clicks, not by the size of the CTR shortfall — a 90%
 * shortfall on 40 impressions is arithmetic, while a 30% shortfall on 40,000 is
 * a morning's work with a real payoff.
 */

const columns: ColumnDef<CtrFinding, any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  {
    accessorKey: "page",
    header: "Page",
    cell: ({ getValue }) => (
      <span className="block max-w-[200px] truncate font-medium sm:max-w-[320px]" title={getValue<string>()}>
        {truncatePath(getValue<string>(), 52)}
      </span>
    ),
    meta: { align: "left" },
  },
  {
    accessorKey: "impressions",
    header: "Impressions",
    cell: ({ getValue }) => formatNumber(getValue<number>()),
    meta: { align: "right" },
  },
  {
    accessorKey: "position",
    header: "Position",
    cell: ({ getValue }) => formatPosition(getValue<number>()),
    meta: { align: "right", className: "hidden sm:table-cell" },
  },
  {
    accessorKey: "ctr",
    header: "CTR vs. expected",
    cell: ({ row }) => (
      <span className="tabular">
        <span className="font-medium text-red-600 dark:text-red-400">
          {formatPercent(row.original.ctr, 2)}
        </span>
        <span className="text-muted-foreground"> / {formatPercent(row.original.expectedCtr, 2)}</span>
      </span>
    ),
    meta: { align: "right" },
  },
  {
    accessorKey: "potentialClicks",
    header: "Recoverable",
    cell: ({ getValue }) => (
      <span className="font-medium tabular">+{formatNumber(getValue<number>())}</span>
    ),
    meta: { align: "right" },
  },
];

export function CtrPanel({
  findings,
  baseline,
  className,
}: {
  findings: CtrFinding[];
  baseline: SearchBaseline;
  className?: string;
}) {
  const recoverable = findings.reduce((sum, f) => sum + f.potentialClicks, 0);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">CTR analysis</h3>
          <p className="text-[13px] text-muted-foreground">
            Pages converting well below what their rank normally earns on this site.
          </p>
        </div>
        {findings.length > 0 && (
          <Badge variant="outline">+{formatNumber(recoverable)} clicks recoverable</Badge>
        )}
      </div>

      {findings.length === 0 ? (
        <EmptyState
          inset
          title="No CTR gaps found"
          description={`Every page with enough impressions is converting close to or above the ${formatPercent(baseline.averageCtr, 2)} this site averages. Nothing to rewrite.`}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={findings}
            searchPlaceholder="Search pages…"
            searchKeys={["page"]}
            pageSize={10}
            initialSort={[{ id: "potentialClicks", desc: true }]}
            emptyTitle="No pages match"
          />
          <div className="rounded-lg border border-border bg-secondary/40 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Recommended action
            </div>
            <p className="mt-1 text-[13px] leading-relaxed">
              Rewrite the title tag and meta description on these pages. Lead with the specific
              answer the query is asking for, keep titles near 60 characters so they are not
              truncated in the results, and add structured data where a rich result applies.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
