"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  className?: string;
  /** CSS color. Defaults to the categorical slot-1 blue. */
  color?: string;
  strokeWidth?: number;
  /** Fill the area under the line with a soft wash. */
  area?: boolean;
}

/**
 * Hand-rolled SVG sparkline.
 *
 * Deliberately *not* Recharts: the portfolio renders ~40 of these at once, and
 * Recharts mounts a ResponsiveContainer + ResizeObserver per chart. This is a
 * single path, no observers, no layout thrash. Recharts earns its weight on the
 * real charts, where axes, tooltips and legends matter.
 *
 * No axes, no ticks, no tooltip — a sparkline shows shape, not values. The
 * number it belongs to is right next to it.
 */
export const Sparkline = React.memo(function Sparkline({
  data,
  className,
  color = "var(--series-1)",
  strokeWidth = 1.5,
  area = true,
}: SparklineProps) {
  const id = React.useId();

  const { line, fill } = React.useMemo(() => {
    if (data.length < 2) return { line: "", fill: "" };

    const w = 100;
    const h = 32;
    const pad = strokeWidth; // keep the stroke inside the viewBox

    const min = Math.min(...data);
    const max = Math.max(...data);
    // A flat series would divide by zero — pin it to the middle instead.
    const span = max - min || 1;

    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return [x, y] as const;
    });

    const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const fill = `${line} L${w},${h} L0,${h} Z`;
    return { line, fill };
  }, [data, strokeWidth]);

  if (!line) return <div className={cn("h-8", className)} aria-hidden />;

  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className={cn("h-8 w-full overflow-visible", className)}
      aria-hidden
      focusable="false"
    >
      {area && (
        <>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={fill} fill={`url(#spark-${id})`} stroke="none" />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
});
