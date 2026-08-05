"use client";

import * as React from "react";
import { ChartFrame } from "./chart-theme";
import { Skeleton } from "@/components/ui/skeleton";
// Type-only imports are erased at compile time, so referencing these for their
// prop shapes pulls no Recharts code into this module — the whole point is that
// Recharts stays out of the initial route chunk and loads only when a chart
// actually renders.
import type { TrendChart as TrendChartComponent } from "./trend-chart";
import type { BreakdownChart as BreakdownChartComponent } from "./breakdown-chart";
import type { ClicksImpressionsChart as ClicksImpressionsChartComponent } from "./clicks-impressions-chart";
import type { ForecastChart as ForecastChartComponent } from "@/components/copilot/forecast-chart";

/**
 * Lazily-loaded chart wrappers.
 *
 * Recharts is the single heaviest dependency in the app and it lives entirely
 * below the fold on every page that uses it — the metrics, headings and tables a
 * reader looks at first are all painted without it. These wrappers move it off
 * the critical path: the route chunk ships without Recharts, each chart's code
 * arrives in a separate chunk after first paint, and a same-height skeleton
 * holds the space so nothing shifts when it lands.
 *
 * The public API is identical to the underlying components — same names, same
 * props — so consumers only change an import path. The sparkline is deliberately
 * *not* here: it is hand-rolled SVG with no Recharts dependency, so lazy-loading
 * it would add a chunk boundary for no saving.
 *
 * `React.lazy` rather than `next/dynamic` because the fallback needs the height
 * prop to reserve the exact right space, and `next/dynamic`'s `loading` option
 * cannot see props. Each chart sits under its own Suspense boundary so one
 * loading does not hold up the others.
 */

type TrendChartProps = React.ComponentProps<typeof TrendChartComponent>;
type BreakdownChartProps = React.ComponentProps<typeof BreakdownChartComponent>;
type ClicksImpressionsChartProps = React.ComponentProps<typeof ClicksImpressionsChartComponent>;
type ForecastChartProps = React.ComponentProps<typeof ForecastChartComponent>;

function ChartSkeleton({ height }: { height: number }) {
  return (
    <ChartFrame height={height}>
      <Skeleton className="h-full w-full rounded-lg" />
    </ChartFrame>
  );
}

const TrendChartLazy = React.lazy(() =>
  import("./trend-chart").then((m) => ({ default: m.TrendChart })),
);
const BreakdownChartLazy = React.lazy(() =>
  import("./breakdown-chart").then((m) => ({ default: m.BreakdownChart })),
);
const ClicksImpressionsChartLazy = React.lazy(() =>
  import("./clicks-impressions-chart").then((m) => ({ default: m.ClicksImpressionsChart })),
);
const ForecastChartLazy = React.lazy(() =>
  import("@/components/copilot/forecast-chart").then((m) => ({ default: m.ForecastChart })),
);

export function TrendChart(props: TrendChartProps) {
  return (
    <React.Suspense fallback={<ChartSkeleton height={props.height ?? 260} />}>
      <TrendChartLazy {...props} />
    </React.Suspense>
  );
}

export function BreakdownChart(props: BreakdownChartProps) {
  return (
    <React.Suspense fallback={<ChartSkeleton height={props.height ?? 168} />}>
      <BreakdownChartLazy {...props} />
    </React.Suspense>
  );
}

export function ClicksImpressionsChart(props: ClicksImpressionsChartProps) {
  // No single height prop — the component stacks a 132 and a 148 panel with
  // labels and gaps, so the reserved space mirrors that layout exactly rather
  // than guessing one number.
  return (
    <React.Suspense
      fallback={
        <div className="space-y-1">
          <div className="pl-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Impressions
          </div>
          <ChartFrame height={132}>
            <Skeleton className="h-full w-full rounded-lg" />
          </ChartFrame>
          <div className="pl-4 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Clicks
          </div>
          <ChartFrame height={148}>
            <Skeleton className="h-full w-full rounded-lg" />
          </ChartFrame>
        </div>
      }
    >
      <ClicksImpressionsChartLazy {...props} />
    </React.Suspense>
  );
}

export function ForecastChart(props: ForecastChartProps) {
  return (
    <React.Suspense fallback={<ChartSkeleton height={props.height ?? 260} />}>
      <ForecastChartLazy {...props} />
    </React.Suspense>
  );
}
