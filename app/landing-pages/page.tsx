"use client";

import { AlertTriangle } from "lucide-react";
import { useFilters } from "@/hooks/use-filters";
import { useSiteReport } from "@/hooks/use-reports";
import { useRegisterPageActions } from "@/hooks/use-page-actions";
import { RANGE_LABELS, formatRange } from "@/lib/date-range";
import { exportFilename } from "@/lib/export";
import { landingPageExportColumns } from "@/lib/export-presets";
import { formatCompact } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  ErrorState,
  NoDataState,
  isEmptyReport,
} from "@/components/dashboard/data-state";
import { TableSkeleton } from "@/components/dashboard/loading-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/tables/data-table";
import { landingPageColumns } from "@/components/tables/columns";

/**
 * Landing Pages — the joined view.
 *
 * This is the one table that puts Search Console and GA4 side by side on the
 * same row: what a page earns in Search (clicks, impressions, CTR, position)
 * next to what it does once people land (users, sessions, engagement). That
 * join is the reason this dashboard exists instead of two browser tabs.
 */
export default function LandingPagesPage() {
  const { range, dateRange } = useFilters();
  const { data, isLoading, error, refresh } = useSiteReport();

  useRegisterPageActions(
    {
      refresh,
      getExport: () =>
        data && {
          filename: exportFilename([data.site.name, "landing-pages", range, dateRange.to]),
          title: `${data.site.name} — Landing Pages`,
          subtitle: `${data.site.domain} · ${RANGE_LABELS[range]} · ${formatRange(dateRange)}`,
          sections: [
            { title: "Landing Pages", rows: data.pages, columns: landingPageExportColumns },
          ],
        },
    },
    [data, refresh, range, dateRange],
  );

  if (error) {
    return <ErrorState error={error} subject="landing pages" />;
  }

  const top = data?.pages[0];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Landing Pages"
        description={
          data ? `${data.site.name} · ${formatRange(dateRange)}` : formatRange(dateRange)
        }
      />

      {isLoading || !data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[92px] rounded-xl" />
            ))}
          </div>
          <TableSkeleton rows={10} />
        </>
      ) : data.pages.length === 0 ? (
        <NoDataState subject="landing page data" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Pages tracked" value={String(data.pages.length)} />
            <StatCard
              label="Best page"
              value={top ? formatCompact(top.clicks) : "—"}
              sub={top?.page}
            />
            <StatCard
              label="Total users"
              value={formatCompact(data.metrics.users.current)}
              change={data.metrics.users.change}
            />
            <StatCard
              label="Total clicks"
              value={formatCompact(data.metrics.clicks.current)}
              change={data.metrics.clicks.change}
            />
          </div>

          <DataTable
            columns={landingPageColumns}
            data={data.pages}
            searchPlaceholder="Search landing pages…"
            searchKeys={["page"]}
            pageSize={12}
            initialSort={[{ id: "users", desc: true }]}
            emptyTitle="No landing pages"
          />
        </>
      )}
    </div>
  );
}
