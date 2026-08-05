"use client";

import { Clock, Eye, MousePointerClick, UserPlus, Users } from "lucide-react";
import type { SiteReportData } from "@/services/types";
import { GA4_METRICS, METRICS } from "@/lib/metrics";
import { formatCompact } from "@/lib/format";
import { ChartCard, ChartLegend } from "@/components/charts/chart-card";
import { BreakdownChart, TrendChart } from "@/components/charts/lazy";
import { SERIES } from "@/components/charts/chart-theme";
import { StatCard } from "./stat-card";

const ICONS = {
  users: Users,
  newUsers: UserPlus,
  sessions: MousePointerClick,
  views: Eye,
  avgEngagementTime: Clock,
  engagedSessions: MousePointerClick,
} as const;

/**
 * The Google Analytics block: the stat row, two trends, and the two breakdowns.
 *
 * Users and Sessions get their own panels rather than sharing one — they're
 * different measures, and stacking them on a single axis invites reading the gap
 * between them as meaningful when it's just sessions-per-user.
 */
export function AnalyticsSection({
  report,
  compare,
}: {
  report: SiteReportData;
  compare: boolean;
}) {
  const legendFor = (color: string) =>
    compare
      ? [
          { label: "Current", color },
          { label: "Previous", color, dashed: true },
        ]
      : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {GA4_METRICS.map((key) => {
          const def = METRICS[key];
          const value = report.metrics[key];
          return (
            <StatCard
              key={key}
              label={def.label}
              value={def.format(value.current)}
              change={value.change}
              lowerIsBetter={def.lowerIsBetter}
              icon={ICONS[key as keyof typeof ICONS]}
              sub={compare ? `from ${def.format(value.previous)}` : undefined}
            />
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Users Trend"
          description="Distinct people across all channels."
          action={compare ? <ChartLegend items={legendFor(SERIES.s1)} /> : null}
        >
          <TrendChart
            data={report.timeseries}
            dataKey="users"
            prevKey="prevUsers"
            label="Users"
            color={SERIES.s1}
            format={formatCompact}
            compare={compare}
            height={220}
          />
        </ChartCard>

        <ChartCard
          title="Sessions Trend"
          description="Visits, including repeat visits."
          action={compare ? <ChartLegend items={legendFor(SERIES.s2)} /> : null}
        >
          <TrendChart
            data={report.timeseries}
            dataKey="sessions"
            prevKey="prevSessions"
            label="Sessions"
            color={SERIES.s2}
            format={formatCompact}
            compare={compare}
            height={220}
          />
        </ChartCard>

        <ChartCard title="Traffic Sources" description="Sessions by default channel group.">
          <BreakdownChart data={report.trafficSources} valueLabel="Sessions" />
        </ChartCard>

        <ChartCard title="Device Breakdown" description="Users by device category.">
          <BreakdownChart data={report.devices} valueLabel="Users" height={132} />
        </ChartCard>
      </div>
    </div>
  );
}
