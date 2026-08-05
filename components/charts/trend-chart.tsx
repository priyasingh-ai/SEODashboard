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
import {
  ANIM,
  axisProps,
  chartMargin,
  cursorProps,
  dateTitle,
  gridProps,
  makeTooltip,
} from "./chart-theme";

interface TrendChartProps {
  data: TimeseriesPoint[];
  /** The measure to plot. */
  dataKey: keyof TimeseriesPoint;
  /** The aligned previous-period measure, drawn as a dashed overlay. */
  prevKey?: keyof TimeseriesPoint;
  label: string;
  color: string;
  format: (n: number) => string;
  /** Axis tick format — usually the compact variant of `format`. */
  formatTick?: (n: number) => string;
  compare?: boolean;
  height?: number;
  /**
   * Invert the y-axis. Only for average position, where rank 1 is the best and
   * belongs at the top.
   */
  reversed?: boolean;
  /** Draw a filled area under the line. */
  area?: boolean;
}

/**
 * One measure over time, with an optional previous-period overlay.
 *
 * The comparison series is the *same hue*, dashed and dimmed — it's the same
 * thing at a different time, not a different thing, so it doesn't earn its own
 * categorical slot. The dash is also the secondary encoding that keeps the two
 * apart without relying on the opacity difference.
 */
export const TrendChart = React.memo(function TrendChart({
  data,
  dataKey,
  prevKey,
  label,
  color,
  format,
  formatTick,
  compare = true,
  height = 260,
  reversed = false,
  area = true,
}: TrendChartProps) {
  const gradientId = React.useId();
  const showPrev = compare && !!prevKey;

  const TooltipContent = React.useMemo(
    () =>
      makeTooltip<TimeseriesPoint>((p) => ({
        title: dateTitle(p.date),
        rows: [
          { label, value: format(p[dataKey] as number), color },
          ...(showPrev
            ? [
                {
                  label: "Previous period",
                  value: format(p[prevKey!] as number),
                  color,
                  dashed: true,
                },
              ]
            : []),
        ],
      })),
    [label, format, dataKey, prevKey, color, showPrev],
  );

  // Position charts get a padded domain — the default 0-based axis wastes the
  // whole plot when every value sits between 6 and 14.
  const domain = React.useMemo<[number | "auto", number | "auto"]>(() => {
    if (!reversed) return [0, "auto"];
    const values = data.map((d) => d[dataKey] as number);
    if (!values.length) return ["auto", "auto"];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.5, (max - min) * 0.25);
    return [Math.max(1, Math.floor(min - pad)), Math.ceil(max + pad)];
  }, [data, dataKey, reversed]);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={chartMargin}>
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
          />
          <YAxis
            {...axisProps}
            width={48}
            reversed={reversed}
            domain={domain}
            tickFormatter={formatTick ?? format}
            allowDecimals={false}
          />
          <Tooltip content={<TooltipContent />} cursor={cursorProps} />

          {showPrev && (
            <Line
              type="monotone"
              dataKey={prevKey as string}
              stroke={color}
              strokeOpacity={0.42}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              activeDot={false}
              isAnimationActive
              animationDuration={ANIM.duration}
            />
          )}

          {area && (
            <Area
              type="monotone"
              dataKey={dataKey as string}
              stroke="none"
              fill={`url(#${gradientId})`}
              isAnimationActive
              animationDuration={ANIM.duration}
            />
          )}

          <Line
            type="monotone"
            dataKey={dataKey as string}
            stroke={color}
            strokeWidth={2}
            dot={false}
            // A ring in the surface color lifts the point off the line beneath it.
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)", fill: color }}
            isAnimationActive
            animationDuration={ANIM.duration}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
});
