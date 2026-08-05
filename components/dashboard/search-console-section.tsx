"use client";

import type { SiteReportData } from "@/services/types";
import { formatCompact, formatPercent, formatPosition } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ChartCard, ChartLegend } from "@/components/charts/chart-card";
import { ClicksImpressionsChart, TrendChart } from "@/components/charts/lazy";
import { SERIES } from "@/components/charts/chart-theme";
import { DataTable } from "@/components/tables/data-table";
import { queryColumns, topPageColumns } from "@/components/tables/columns";

/**
 * The Search Console block: three charts and the two ranked tables.
 *
 * Shared by the website dashboard and the dedicated Search Console page, so the
 * two can never drift apart.
 */
export function SearchConsoleSection({
  report,
  compare,
}: {
  report: SiteReportData;
  compare: boolean;
}) {
  const legend = compare
    ? [
        { label: "Current period", color: SERIES.s1 },
        { label: "Previous period", color: SERIES.s1, dashed: true },
      ]
    : [];

  return (
    <div className="space-y-4">
      <ChartCard
        title="Clicks vs. Impressions"
        description="Separate scales — impressions run 20–50× clicks, so one axis would flatten the smaller series."
        className="lg:col-span-2"
        action={
          compare ? (
            <ChartLegend
              items={[
                { label: "Current", color: SERIES.s1 },
                { label: "Previous", color: SERIES.s1, dashed: true },
              ]}
            />
          ) : null
        }
      >
        <ClicksImpressionsChart data={report.timeseries} compare={compare} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="CTR Trend"
          description="Clicks divided by impressions."
          action={legend.length ? <ChartLegend items={legend} /> : null}
        >
          <TrendChart
            data={report.timeseries}
            dataKey="ctr"
            prevKey="prevCtr"
            label="CTR"
            color={SERIES.s1}
            format={(n) => formatPercent(n, 2)}
            formatTick={(n) => formatPercent(n, 1)}
            compare={compare}
            height={220}
          />
        </ChartCard>

        <ChartCard
          title="Average Position Trend"
          description="Axis is inverted — rank 1 sits at the top, so up is better."
          action={legend.length ? <ChartLegend items={legend} /> : null}
        >
          <TrendChart
            data={report.timeseries}
            dataKey="position"
            prevKey="prevPosition"
            label="Avg. position"
            color={SERIES.s1}
            format={formatPosition}
            compare={compare}
            height={220}
            reversed
            area={false}
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <h3 className="text-[13px] font-semibold tracking-tight">Top Queries</h3>
            <Badge variant="outline">
              {formatCompact(report.queries.reduce((t, q) => t + q.clicks, 0))} clicks
            </Badge>
          </div>
          <DataTable
            columns={queryColumns}
            data={report.queries}
            pageSize={8}
            initialSort={[{ id: "clicks", desc: true }]}
            emptyTitle="No queries in this range"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <h3 className="text-[13px] font-semibold tracking-tight">Top Pages</h3>
            <Badge variant="outline">{report.pages.length} pages</Badge>
          </div>
          <DataTable
            columns={topPageColumns}
            data={report.pages}
            pageSize={8}
            initialSort={[{ id: "clicks", desc: true }]}
            emptyTitle="No pages in this range"
          />
        </div>
      </div>
    </div>
  );
}
