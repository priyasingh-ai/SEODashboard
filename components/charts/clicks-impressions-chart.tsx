"use client";

import * as React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimeseriesPoint } from "@/types";
import { formatShortDate } from "@/lib/date-range";
import { formatCompact, formatNumber } from "@/lib/format";
import {
  ANIM,
  SERIES,
  axisProps,
  cursorProps,
  dateTitle,
  gridProps,
  makeTooltip,
} from "./chart-theme";

/**
 * Clicks vs. Impressions.
 *
 * These are the two measures everyone reaches for a dual-axis chart to compare —
 * and a dual axis is the single worst thing you can do to a chart. Impressions
 * run ~25–50× clicks here, so a shared axis flattens clicks to the baseline,
 * and two independent y-scales let you manufacture any crossover you like just
 * by re-scaling.
 *
 * Instead: two stacked panels, each with its own honest zero-based axis, sharing
 * one x-axis. Recharts' `syncId` ties the crosshair together, so hovering either
 * panel reads both — you get the comparison without the lie.
 */

const SYNC_ID = "clicks-impressions";

interface PanelProps {
  data: TimeseriesPoint[];
  dataKey: "clicks" | "impressions";
  prevKey: "prevClicks" | "prevImpressions";
  label: string;
  color: string;
  compare: boolean;
  height: number;
  showXAxis: boolean;
}

function Panel({
  data,
  dataKey,
  prevKey,
  label,
  color,
  compare,
  height,
  showXAxis,
}: PanelProps) {
  const gradientId = React.useId();

  const TooltipContent = React.useMemo(
    () =>
      makeTooltip<TimeseriesPoint>((p) => ({
        title: dateTitle(p.date),
        rows: [
          { label, value: formatNumber(p[dataKey]), color },
          ...(compare
            ? [{ label: "Previous period", value: formatNumber(p[prevKey]), color, dashed: true }]
            : []),
        ],
      })),
    [label, dataKey, prevKey, color, compare],
  );

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          syncId={SYNC_ID}
          margin={{ top: 8, right: 8, bottom: showXAxis ? 0 : 4, left: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.16} />
              <stop offset="100%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
          </defs>

          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="date"
            {...axisProps}
            tickFormatter={formatShortDate}
            minTickGap={28}
            dy={6}
            hide={!showXAxis}
          />
          <YAxis
            {...axisProps}
            width={48}
            domain={[0, "auto"]}
            tickFormatter={formatCompact}
            allowDecimals={false}
          />
          <Tooltip content={<TooltipContent />} cursor={cursorProps} />

          {compare && (
            <Line
              type="monotone"
              dataKey={prevKey}
              stroke={color}
              strokeOpacity={0.42}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              activeDot={false}
              animationDuration={ANIM.duration}
            />
          )}
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke="none"
            fill={`url(#${gradientId})`}
            animationDuration={ANIM.duration}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)", fill: color }}
            animationDuration={ANIM.duration}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ClicksImpressionsChart({
  data,
  compare = true,
}: {
  data: TimeseriesPoint[];
  compare?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="pl-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Impressions
      </div>
      <Panel
        data={data}
        dataKey="impressions"
        prevKey="prevImpressions"
        label="Impressions"
        color={SERIES.s2}
        compare={compare}
        height={132}
        showXAxis={false}
      />
      <div className="pl-4 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Clicks
      </div>
      <Panel
        data={data}
        dataKey="clicks"
        prevKey="prevClicks"
        label="Clicks"
        color={SERIES.s1}
        compare={compare}
        height={148}
        showXAxis
      />
    </div>
  );
}
