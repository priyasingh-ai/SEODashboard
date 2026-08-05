"use client";

import { AlertTriangle } from "lucide-react";
import { useFilters } from "@/hooks/use-filters";
import { useSiteReport } from "@/hooks/use-reports";
import { useRegisterPageActions } from "@/hooks/use-page-actions";
import { RANGE_LABELS, formatRange } from "@/lib/date-range";
import { GSC_METRICS } from "@/lib/metrics";
import { exportFilename } from "@/lib/export";
import {
  ctrFindingExportColumns,
  opportunityExportColumns,
  pageExportColumns,
  pageHealthExportColumns,
  queryExportColumns,
} from "@/lib/export-presets";
import { useSearchInsights } from "@/hooks/use-search-insights";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewGrid } from "@/components/dashboard/overview-grid";
import { SearchConsoleSection } from "@/components/dashboard/search-console-section";
import { SearchIntelligence } from "@/components/search-console/search-intelligence";
import {
  ErrorState,
  NoDataState,
  isEmptyReport,
} from "@/components/dashboard/data-state";
import {
  ChartCardSkeleton,
  MetricGridSkeleton,
  TableSkeleton,
} from "@/components/dashboard/loading-skeleton";

export default function SearchConsolePage() {
  const { compare, range, dateRange } = useFilters();
  const { data, isLoading, error, refresh } = useSiteReport();

  // Derived here rather than inside the panel so the export can carry the same
  // rows the tables show, without fitting the CTR curve a second time.
  const insights = useSearchInsights(data);

  useRegisterPageActions(
    {
      refresh,
      getExport: () =>
        data &&
        insights && {
          filename: exportFilename([data.site.name, "search-console", range, dateRange.to]),
          title: `${data.site.name} — Search Console`,
          subtitle: `${data.site.domain} · ${RANGE_LABELS[range]} · ${formatRange(dateRange)}`,
          sections: [
            { title: "Top Queries", rows: data.queries, columns: queryExportColumns },
            { title: "Top Pages", rows: data.pages, columns: pageExportColumns },
            {
              title: "Query Opportunities",
              rows: insights.opportunities,
              columns: opportunityExportColumns,
            },
            { title: "CTR Analysis", rows: insights.findings, columns: ctrFindingExportColumns },
            {
              title: "Landing Page Health",
              rows: insights.health,
              columns: pageHealthExportColumns,
            },
          ],
        },
    },
    [data, insights, refresh, range, dateRange],
  );

  if (error) {
    return <ErrorState error={error} subject="Search Console data" />;
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Search Console"
        description={
          data ? `${data.site.name} · ${formatRange(dateRange)}` : formatRange(dateRange)
        }
      />

      {isLoading || !data ? (
        <div className="space-y-4">
          <MetricGridSkeleton count={4} />
          <ChartCardSkeleton />
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCardSkeleton />
            <ChartCardSkeleton />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <TableSkeleton rows={6} />
            <TableSkeleton rows={6} />
          </div>
        </div>
      ) : isEmptyReport(data) ? (
        <NoDataState subject="Search Console data" />
      ) : (
        <div className="space-y-6">
          <OverviewGrid metrics={data.metrics} compare={compare} keys={GSC_METRICS} />
          <SearchConsoleSection report={data} compare={compare} />
          {insights && <SearchIntelligence report={data} insights={insights} />}
        </div>
      )}
    </div>
  );
}
