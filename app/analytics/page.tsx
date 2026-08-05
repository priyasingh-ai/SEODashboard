"use client";

import { AlertTriangle } from "lucide-react";
import { useFilters } from "@/hooks/use-filters";
import { useAnalyticsInsights, useSiteReport } from "@/hooks/use-reports";
import { useRegisterPageActions } from "@/hooks/use-page-actions";
import { RANGE_LABELS, formatRange } from "@/lib/date-range";
import { exportFilename } from "@/lib/export";
import {
  acquisitionExportColumns,
  dropOffExportColumns,
  landingPageExportColumns,
  pagePerformanceExportColumns,
} from "@/lib/export-presets";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { AnalyticsSection } from "@/components/dashboard/analytics-section";
import { AnalyticsIntelligence } from "@/components/analytics/analytics-intelligence";
import {
  ErrorState,
  NoDataState,
  isEmptyReport,
} from "@/components/dashboard/data-state";
import { ChartCardSkeleton, MetricGridSkeleton } from "@/components/dashboard/loading-skeleton";

export default function AnalyticsPage() {
  const { compare, range, dateRange } = useFilters();
  const { data, isLoading, error, refresh } = useSiteReport();
  // Its own request: a dozen GA4 reports that only this page needs.
  const insights = useAnalyticsInsights();

  useRegisterPageActions(
    {
      refresh: () => {
        refresh();
        insights.refresh();
      },
      getExport: () =>
        data && {
          filename: exportFilename([data.site.name, "analytics", range, dateRange.to]),
          title: `${data.site.name} — Google Analytics`,
          subtitle: `${data.site.domain} · ${RANGE_LABELS[range]} · ${formatRange(dateRange)}`,
          sections: [
            { title: "Landing Pages", rows: data.pages, columns: landingPageExportColumns },
            {
              title: "Traffic Sources",
              rows: data.trafficSources,
              columns: [
                { header: "Channel", value: (r: { label: string }) => r.label },
                { header: "Sessions", value: (r: { value: number }) => r.value },
                {
                  header: "Share",
                  value: (r: { share: number }) => `${(r.share * 100).toFixed(1)}%`,
                },
              ],
            },
            {
              title: "Devices",
              rows: data.devices,
              columns: [
                { header: "Device", value: (r: { label: string }) => r.label },
                { header: "Users", value: (r: { value: number }) => r.value },
                {
                  header: "Share",
                  value: (r: { share: number }) => `${(r.share * 100).toFixed(1)}%`,
                },
              ],
            },
            ...(insights.data
              ? [
                  { title: "Channels", rows: insights.data.channels, columns: acquisitionExportColumns },
                  { title: "Source / Medium", rows: insights.data.sources, columns: acquisitionExportColumns },
                  { title: "Page Performance", rows: insights.data.pages, columns: pagePerformanceExportColumns },
                  { title: "Drop-off Pages", rows: insights.data.dropOff, columns: dropOffExportColumns },
                ]
              : []),
          ],
        },
    },
    [data, insights.data, refresh, insights.refresh, range, dateRange],
  );

  if (error) {
    return <ErrorState error={error} subject="Analytics data" />;
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Google Analytics"
        description={
          data ? `${data.site.name} · ${formatRange(dateRange)}` : formatRange(dateRange)
        }
      />

      {isLoading || !data ? (
        <div className="space-y-4">
          <MetricGridSkeleton count={6} />
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCardSkeleton />
            <ChartCardSkeleton />
            <ChartCardSkeleton />
            <ChartCardSkeleton />
          </div>
        </div>
      ) : isEmptyReport(data) ? (
        <NoDataState subject="Analytics data" />
      ) : (
        <div className="space-y-6">
          <AnalyticsSection report={data} compare={compare} />
          {insights.error ? null : insights.isLoading || !insights.data ? (
            <Skeleton className="h-[420px] rounded-xl" />
          ) : (
            <AnalyticsIntelligence data={insights.data} />
          )}
        </div>
      )}
    </div>
  );
}
