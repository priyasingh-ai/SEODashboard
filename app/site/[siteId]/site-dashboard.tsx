"use client";

import * as React from "react";
import { useFilters } from "@/hooks/use-filters";
import { useSiteReport } from "@/hooks/use-reports";
import { useRegisterPageActions } from "@/hooks/use-page-actions";
import { RANGE_LABELS, formatRange } from "@/lib/date-range";
import { formatRelativeTime } from "@/lib/format";
import { exportFilename } from "@/lib/export";
import { pageExportColumns, queryExportColumns } from "@/lib/export-presets";
import { findWebsite } from "@/lib/websites";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { OverviewGrid } from "@/components/dashboard/overview-grid";
import { SearchConsoleSection } from "@/components/dashboard/search-console-section";
import { AnalyticsSection } from "@/components/dashboard/analytics-section";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import {
  ErrorState,
  NoDataState,
  isEmptyReport,
} from "@/components/dashboard/data-state";
import { Badge } from "@/components/ui/badge";

/**
 * The dedicated dashboard for one website: every metric, both sources, one page.
 *
 * `siteId` is validated by the server component in `page.tsx`, so by the time
 * this renders the site is known to exist.
 */
export function SiteDashboard({ siteId }: { siteId: string }) {
  const { compare, range, dateRange } = useFilters();

  const site = findWebsite(siteId)!;
  const { data, isLoading, error, refresh } = useSiteReport(siteId);

  useRegisterPageActions(
    {
      refresh,
      getExport: () =>
        data && {
          filename: exportFilename([data.site.name, range, dateRange.to]),
          title: `${data.site.name} — SEO Report`,
          subtitle: `${data.site.domain} · ${RANGE_LABELS[range]} · ${formatRange(dateRange)}`,
          sections: [
            { title: "Top Queries", rows: data.queries, columns: queryExportColumns },
            { title: "Top Pages", rows: data.pages, columns: pageExportColumns },
          ],
        },
    },
    [data, refresh, range, dateRange],
  );

  if (error) {
    return <ErrorState error={error} subject={site.name} />;
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <PageHeader
        title={site.name}
        description={`${site.domain} · ${formatRange(dateRange)}`}
        action={
          // Sync freshness is runtime state, not configuration, so it rides in
          // with the report rather than being read off the static registry.
          data ? (
            <Badge variant="outline" className="gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              Synced {formatRelativeTime(data.site.lastSync, new Date().toISOString())}
            </Badge>
          ) : null
        }
      />

      {isLoading || !data ? (
        <DashboardSkeleton />
      ) : isEmptyReport(data) ? (
        <NoDataState subject={`data for ${site.name}`} />
      ) : (
        <>
          <OverviewGrid metrics={data.metrics} compare={compare} />

          <section className="space-y-3">
            <SectionHeader
              title="Search Console"
              description="How the site performs in Google Search results."
            />
            <SearchConsoleSection report={data} compare={compare} />
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Google Analytics"
              description="What people do once they arrive."
            />
            <AnalyticsSection report={data} compare={compare} />
          </section>
        </>
      )}
    </div>
  );
}
