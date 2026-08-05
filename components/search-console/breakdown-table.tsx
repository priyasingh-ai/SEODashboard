"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { SearchBreakdownRow } from "@/types";
import { formatNumber, formatPercent, formatPosition } from "@/lib/format";
import { countryFlag } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/tables/data-table";
import { TrendBadge } from "@/components/dashboard/trend-badge";

/**
 * Search Console clicks broken down by one dimension.
 *
 * One component serves both the country and the device table — they differ only
 * in whether a flag is shown and how many rows are worth paginating, so two
 * near-identical components would be pure duplication.
 */

/** Proportion bar behind the share figure — cheap to scan down a column. */
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

function buildColumns(showFlag: boolean): ColumnDef<SearchBreakdownRow, any>[] { // eslint-disable-line @typescript-eslint/no-explicit-any
  return [
    {
      accessorKey: "label",
      header: showFlag ? "Country" : "Device",
      cell: ({ row }) => (
        <span className="flex items-center gap-2 font-medium">
          {showFlag && (
            <span className="text-[15px] leading-none" aria-hidden>
              {countryFlag(row.original.key) ?? "🏳️"}
            </span>
          )}
          <span className="truncate">{row.original.label}</span>
        </span>
      ),
      meta: { align: "left" },
    },
    {
      accessorKey: "clicks",
      header: "Clicks",
      cell: ({ getValue }) => formatNumber(getValue<number>()),
      meta: { align: "right" },
    },
    {
      accessorKey: "share",
      header: "Share",
      cell: ({ getValue }) => <ShareCell share={getValue<number>()} />,
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
      meta: { align: "right", className: "hidden md:table-cell" },
    },
    {
      accessorKey: "position",
      header: "Position",
      cell: ({ getValue }) => formatPosition(getValue<number>()),
      meta: { align: "right", className: "hidden md:table-cell" },
    },
    {
      accessorKey: "trend",
      header: "Trend",
      cell: ({ getValue }) => <TrendBadge change={getValue<number>()} />,
      meta: { align: "right" },
    },
  ];
}

export function BreakdownTable({
  rows,
  dimension,
  className,
}: {
  rows: SearchBreakdownRow[];
  dimension: "country" | "device";
  className?: string;
}) {
  const isCountry = dimension === "country";
  const columns = React.useMemo(() => buildColumns(isCountry), [isCountry]);

  return (
    <DataTable
      className={cn(className)}
      columns={columns}
      data={rows}
      // Devices are a fixed three rows; countries can be a long tail.
      paginate={isCountry}
      pageSize={isCountry ? 10 : 5}
      searchPlaceholder={isCountry ? "Search countries…" : undefined}
      searchKeys={isCountry ? ["label"] : undefined}
      initialSort={[{ id: "clicks", desc: true }]}
      emptyTitle={isCountry ? "No country data" : "No device data"}
      emptyDescription="Search Console reported no rows for this dimension in the selected range."
    />
  );
}
