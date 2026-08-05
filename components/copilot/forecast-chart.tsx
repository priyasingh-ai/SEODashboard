"use client";

import * as React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatShortDate } from "@/lib/date-range";
import { formatCompact, formatNumber } from "@/lib/format";
import type { Forecast } from "@/lib/copilot";
import type { TimeseriesPoint } from "@/types";
import {
  ANIM,
  ChartFrame,
  SERIES,
  axisProps,
  chartMargin,
  cursorProps,
  dateTitle,
  gridProps,
  makeTooltip,
} from "@/components/charts/chart-theme";

/**
 * History and projection on one axis.
 *
 * Three things carry the honesty of this chart, and all three are deliberate:
 *
 *   - The projected line is **dashed**, so it is never mistaken for a
 *     measurement at a glance.
 *   - The interval is drawn as a filled band that visibly **widens**, which is
 *     the single most important fact about any forecast and the one a bare line
 *     hides completely.
 *   - A vertical rule marks where measurement stops and extrapolation starts.
 *
 * A projection rendered in the same weight as history is a lie told with CSS,
 * and it is the default in most SEO tooling.
 */

interface Point {
  date: string;
  actual?: number;
  projected?: number;
  /** `[lower, upper]` — Recharts renders a two-element value as a range area. */
  band?: [number, number];
}

const Tip = makeTooltip<Point>((point) => ({
  title: dateTitle(point.date),
  rows:
    point.actual !== undefined
      ? [{ label: "Clicks", value: formatNumber(point.actual), color: SERIES.s1 }]
      : [
          { label: "Projected", value: formatNumber(point.projected ?? 0), color: SERIES.s3 },
          {
            label: "95% range",
            value: point.band
              ? `${formatNumber(point.band[0])} – ${formatNumber(point.band[1])}`
              : "—",
          },
        ],
}));

export function ForecastChart({
  history,
  forecast,
  height = 260,
}: {
  history: TimeseriesPoint[];
  forecast: Forecast;
  height?: number;
}) {
  const data = React.useMemo<Point[]>(() => {
    const past: Point[] = history.map((p) => ({ date: p.date, actual: p.clicks }));

    // Seed the projection from the last measured day so the dashed line and the
    // band connect to history instead of floating away from it.
    const last = history[history.length - 1];
    const seed: Point[] = last
      ? [{ date: last.date, actual: last.clicks, projected: last.clicks, band: [last.clicks, last.clicks] }]
      : [];

    const future: Point[] = forecast.points.map((p) => ({
      date: p.date,
      projected: p.clicks,
      band: [p.lower, p.upper],
    }));

    return past.length > 0 ? [...past.slice(0, -1), ...seed, ...future] : future;
  }, [history, forecast]);

  const boundary = history[history.length - 1]?.date;

  return (
    <ChartFrame height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={chartMargin}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="date"
            {...axisProps}
            tickFormatter={formatShortDate}
            minTickGap={28}
          />
          <YAxis {...axisProps} width={44} tickFormatter={formatCompact} allowDecimals={false} />
          <Tooltip content={<Tip />} cursor={cursorProps} />

          <Area
            dataKey="band"
            stroke="none"
            fill={SERIES.s3}
            fillOpacity={0.12}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            dataKey="actual"
            stroke={SERIES.s1}
            strokeWidth={2}
            dot={false}
            animationDuration={ANIM.duration}
          />
          <Line
            dataKey="projected"
            stroke={SERIES.s3}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
            animationDuration={ANIM.duration}
          />
          {boundary && (
            <ReferenceLine
              x={boundary}
              stroke={SERIES.s3}
              strokeDasharray="2 4"
              strokeOpacity={0.6}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
