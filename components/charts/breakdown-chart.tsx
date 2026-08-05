"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BreakdownSlice } from "@/types";
import { formatNumber, formatPercent } from "@/lib/format";
import { ANIM, SERIES, ChartTooltip } from "./chart-theme";

const SLOTS = [SERIES.s1, SERIES.s2, SERIES.s3, SERIES.s4];

/**
 * Categorical magnitude — traffic sources, device split.
 *
 * Horizontal bars, not a pie or a donut. Ranking four categories by size is
 * exactly what bars are for; a pie makes you compare wedge angles, which nobody
 * can do accurately, and it burns twice the space to say less.
 *
 * Every bar is directly labelled with its value and share. That's also what
 * discharges the relief rule — two of the light-mode slots sit under 3:1 against
 * a white surface, so the label carries the reading, not the fill.
 */
export function BreakdownChart({
  data,
  valueLabel,
  height = 168,
}: {
  data: BreakdownSlice[];
  /** What the number counts — "Sessions", "Users". */
  valueLabel: string;
  height?: number;
}) {
  // Color follows the entity, not the rank: pin each label to a slot up front so
  // a re-sort or a filter can never repaint the survivors.
  const colorFor = React.useMemo(() => {
    const map = new Map<string, string>();
    data.forEach((d, i) => map.set(d.label, SLOTS[i % SLOTS.length]));
    return map;
  }, [data]);

  const TooltipContent = React.useCallback(
    ({ active, payload }: { active?: boolean; payload?: { payload: BreakdownSlice }[] }) => {
      if (!active || !payload?.length) return null;
      const slice = payload[0].payload;
      return (
        <ChartTooltip
          active
          title={slice.label}
          rows={[
            { label: valueLabel, value: formatNumber(slice.value), color: colorFor.get(slice.label) },
            { label: "Share", value: formatPercent(slice.share, 1) },
          ]}
        />
      );
    },
    [valueLabel, colorFor],
  );

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-2">
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
            barCategoryGap={10}
          >
            <XAxis type="number" domain={[0, max]} hide />
            <YAxis
              type="category"
              dataKey="label"
              width={96}
              tick={{ fill: "var(--viz-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={<TooltipContent />}
              cursor={{ fill: "var(--viz-grid)", fillOpacity: 0.5 }}
            />
            <Bar
              dataKey="value"
              // 4px rounded data-end, anchored square to the baseline.
              radius={[0, 4, 4, 0]}
              barSize={14}
              animationDuration={ANIM.duration}
            >
              {data.map((slice) => (
                <Cell key={slice.label} fill={colorFor.get(slice.label)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Direct labels — the values, in text ink, never in the series color. */}
      <ul className="space-y-1.5 px-3">
        {data.map((slice) => (
          <li key={slice.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: colorFor.get(slice.label) }}
              />
              <span className="truncate text-muted-foreground">{slice.label}</span>
            </span>
            <span className="shrink-0 tabular">
              <span className="font-medium">{formatNumber(slice.value)}</span>
              <span className="ml-2 text-muted-foreground">{formatPercent(slice.share, 1)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
