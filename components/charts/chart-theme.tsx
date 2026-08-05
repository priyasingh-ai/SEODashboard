"use client";

import * as React from "react";
import type { TooltipProps } from "recharts";
import { formatLongDate } from "@/lib/date-range";
import { cn } from "@/lib/utils";

/**
 * Shared chart chrome.
 *
 * Colors resolve through CSS custom properties (`var(--series-1)`) rather than
 * literal hex. SVG presentation attributes honour custom properties, so dark
 * mode swaps every series at the token level with no re-render and no
 * `useTheme()` plumbing in a single chart.
 *
 * The palette itself is the validated eight-hue categorical set — see
 * `app/globals.css`. Slots are assigned in fixed order and never cycled.
 */

export const SERIES = {
  s1: "var(--series-1)", // blue
  s2: "var(--series-2)", // green
  s3: "var(--series-3)", // magenta
  s4: "var(--series-4)", // yellow
} as const;

export const GRID = "var(--viz-grid)";
export const AXIS = "var(--viz-axis)";
export const MUTED_INK = "var(--viz-muted)";

/** Recessive axis defaults — the data should be the loudest thing on the card. */
export const axisProps = {
  stroke: AXIS,
  tick: { fill: MUTED_INK, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = {
  stroke: GRID,
  strokeDasharray: "0",
  vertical: false,
} as const;

/** Framer-ish easing for Recharts' own animations. */
export const ANIM = { duration: 520, easing: "ease-out" } as const;

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
  dashed?: boolean;
}

/**
 * The tooltip.
 *
 * Every line/area chart gets one — an HTML chart is interactive by default, and
 * a crosshair + tooltip is how you read a value off a trend without labelling
 * every point.
 */
export function ChartTooltip({
  active,
  title,
  rows,
}: {
  active?: boolean;
  title: string;
  rows: TooltipRow[];
}) {
  if (!active || !rows.length) return null;
  return (
    <div className="pointer-events-none min-w-[164px] rounded-lg border border-border bg-popover p-2.5 text-popover-foreground shadow-popover">
      <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">{title}</div>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {row.color && (
                <span
                  aria-hidden
                  className="h-0.5 w-2.5 shrink-0 rounded-full"
                  style={
                    row.dashed
                      ? {
                          backgroundImage: `repeating-linear-gradient(to right, ${row.color} 0 2px, transparent 2px 4px)`,
                        }
                      : { backgroundColor: row.color }
                  }
                />
              )}
              {row.label}
            </span>
            {/* Tooltip values are a column — tabular figures keep them aligned. */}
            <span className="font-medium tabular">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Build a Recharts `content` renderer from a row-mapping function. */
export function makeTooltip<T>(
  map: (point: T) => { title: string; rows: TooltipRow[] },
) {
  function Content({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload as T;
    const { title, rows } = map(point);
    return <ChartTooltip active title={title} rows={rows} />;
  }
  Content.displayName = "ChartTooltipContent";
  return Content;
}

/** Default tooltip title for date-keyed series. */
export function dateTitle(date: string) {
  return formatLongDate(date);
}

/** The crosshair rule drawn under the tooltip. */
export const cursorProps = {
  stroke: AXIS,
  strokeWidth: 1,
  strokeDasharray: "3 3",
} as const;

/** Fixed plot margins — consistent optical spacing across every card. */
export const chartMargin = { top: 8, right: 8, bottom: 0, left: 0 } as const;

export function ChartFrame({
  height = 260,
  children,
  className,
}: {
  height?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      {children}
    </div>
  );
}
