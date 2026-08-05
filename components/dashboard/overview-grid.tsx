"use client";

import type { Metrics, MetricKey } from "@/types";
import { OVERVIEW_METRICS } from "@/lib/metrics";
import { MetricCard } from "./metric-card";

/**
 * The overview card grid.
 *
 * Ten cards across five columns on desktop, collapsing to two on mobile —
 * Search Console's four on the first row, GA4's six after, so the two data
 * sources stay visually grouped without needing labels.
 */
export function OverviewGrid({
  metrics,
  compare = true,
  keys = OVERVIEW_METRICS,
}: {
  metrics: Metrics;
  compare?: boolean;
  keys?: MetricKey[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {keys.map((key, i) => (
        <MetricCard key={key} metricKey={key} value={metrics[key]} compare={compare} index={i} />
      ))}
    </div>
  );
}
