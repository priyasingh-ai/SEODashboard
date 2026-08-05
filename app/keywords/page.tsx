"use client";

import { AlertTriangle } from "lucide-react";
import { useFilters } from "@/hooks/use-filters";
import { useSiteReport } from "@/hooks/use-reports";
import { useRegisterPageActions } from "@/hooks/use-page-actions";
import { RANGE_LABELS, formatRange } from "@/lib/date-range";
import { exportFilename } from "@/lib/export";
import { queryExportColumns } from "@/lib/export-presets";
import { formatCompact, formatPercent, formatPosition } from "@/lib/format";
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
import { keywordColumns } from "@/components/tables/columns";

export default function KeywordsPage() {
  const { range, dateRange } = useFilters();
  const { data, isLoading, error, refresh } = useSiteReport();

  useRegisterPageActions(
    {
      refresh,
      getExport: () =>
        data && {
          filename: exportFilename([data.site.name, "keywords", range, dateRange.to]),
          title: `${data.site.name} — Keywords`,
          subtitle: `${data.site.domain} · ${RANGE_LABELS[range]} · ${formatRange(dateRange)}`,
          sections: [{ title: "Keywords", rows: data.queries, columns: queryExportColumns }],
        },
    },
    [data, refresh, range, dateRange],
  );

  if (error) {
    return <ErrorState error={error} subject="keywords" />;
  }

  const top = data?.queries[0];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Keywords"
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
      ) : data.queries.length === 0 ? (
        <NoDataState subject="keyword data" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Keywords tracked" value={String(data.queries.length)} />
            <StatCard
              label="Top keyword"
              value={top ? formatCompact(top.clicks) : "—"}
              sub={top?.keyword}
            />
            <StatCard
              label="Average CTR"
              value={formatPercent(data.metrics.ctr.current, 2)}
              change={data.metrics.ctr.change}
            />
            <StatCard
              label="Average position"
              value={formatPosition(data.metrics.position.current)}
              change={data.metrics.position.change}
              lowerIsBetter
            />
          </div>

          <DataTable
            columns={keywordColumns}
            data={data.queries}
            searchPlaceholder="Search keywords…"
            searchKeys={["keyword"]}
            pageSize={12}
            initialSort={[{ id: "clicks", desc: true }]}
            emptyTitle="No keywords"
          />
        </>
      )}
    </div>
  );
}
