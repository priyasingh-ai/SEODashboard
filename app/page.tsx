"use client";

import * as React from "react";
import { usePortfolio } from "@/hooks/use-reports";
import { useFilters } from "@/hooks/use-filters";
import { useRegisterPageActions } from "@/hooks/use-page-actions";
import { RANGE_LABELS, formatRange } from "@/lib/date-range";
import { exportFilename } from "@/lib/export";
import { portfolioExportColumns } from "@/lib/export-presets";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { PortfolioHighlights } from "@/components/dashboard/portfolio-highlights";
import { WebsiteCard } from "@/components/dashboard/website-card";
import { OverviewGrid } from "@/components/dashboard/overview-grid";
import {
  ErrorState,
  NoDataState,
  isEmptyReport,
} from "@/components/dashboard/data-state";
import {
  TableSkeleton,
  WebsiteCardSkeleton,
} from "@/components/dashboard/loading-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/tables/data-table";
import { portfolioColumns } from "@/components/tables/columns";

/**
 * Portfolio Overview — the home page.
 *
 * Reading order is the order of the questions: the highlight row answers
 * "which site should I care about right now", the cards give each site's shape,
 * and the table is there when you want to compare a specific column across all
 * four.
 */
export default function PortfolioPage() {
  const { range, compare, dateRange } = useFilters();
  const { data, isLoading, error, refresh } = usePortfolio();

  // Carry the active window into every site link.
  const query = React.useMemo(() => {
    const p = new URLSearchParams();
    if (range !== "28d") p.set("range", range);
    if (range === "custom") {
      p.set("from", dateRange.from);
      p.set("to", dateRange.to);
    }
    if (!compare) p.set("compare", "0");
    return p.toString();
  }, [range, compare, dateRange]);

  useRegisterPageActions(
    {
      refresh,
      getExport: () =>
        data && {
          filename: exportFilename(["portfolio", range, dateRange.to]),
          title: "SEO Portfolio Summary",
          subtitle: `${RANGE_LABELS[range]} · ${formatRange(dateRange)}`,
          sections: [
            { title: "All websites", rows: data.rows, columns: portfolioExportColumns },
          ],
        },
    },
    [data, refresh, range, dateRange],
  );

  const columns = React.useMemo(() => portfolioColumns(query), [query]);

  if (error) {
    return <ErrorState error={error} subject="your portfolio" />;
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <PageHeader
        title="Portfolio"
        description={`Search Console and Analytics across every property · ${formatRange(dateRange)}`}
      />

      {isLoading || !data ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <WebsiteCardSkeleton key={i} />
            ))}
          </div>
          <TableSkeleton rows={4} />
        </>
      ) : data.rows.length === 0 ? (
        <NoDataState
          subject="website data"
          description="No property returned data for this period. Check that each site is connected and try a wider date range."
        />
      ) : (
        <>
          <PortfolioHighlights rows={data.rows} query={query} />

          <section className="space-y-3">
            <SectionHeader
              title="Websites"
              description="Select a site to open its full dashboard."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {data.rows.map((row, i) => (
                <WebsiteCard key={row.site.id} row={row} index={i} query={query} />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Portfolio totals"
              description="Every property combined. Rates are weighted, not averaged."
            />
            <OverviewGrid metrics={data.totals} compare={compare} />
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Summary"
              description="Sort any column to rank the portfolio by it."
            />
            <DataTable
              columns={columns}
              data={data.rows}
              paginate={false}
              initialSort={[{ id: "clicks", desc: true }]}
              emptyTitle="No websites"
            />
          </section>
        </>
      )}
    </div>
  );
}
