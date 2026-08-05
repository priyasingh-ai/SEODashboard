import type { MetricKey } from "@/types";
import {
  formatCompact,
  formatDuration,
  formatNumber,
  formatPercent,
  formatPosition,
} from "./format";

export type MetricSource = "gsc" | "ga4";

export interface MetricDef {
  key: MetricKey;
  label: string;
  /** Which Google product the number comes from. Drives the source chip. */
  source: MetricSource;
  /** Compact rendering for cards. */
  format: (n: number) => string;
  /** Precise rendering for tables and tooltips. */
  formatExact: (n: number) => string;
  /**
   * Average position is the one metric where *down is good* — rank 3 beats
   * rank 12. Everything that renders a delta reads this flag rather than
   * assuming a positive change is a win.
   */
  lowerIsBetter?: boolean;
  hint: string;
}

export const METRICS: Record<MetricKey, MetricDef> = {
  clicks: {
    key: "clicks",
    label: "Organic Clicks",
    source: "gsc",
    format: formatCompact,
    formatExact: formatNumber,
    hint: "Clicks from Google Search results.",
  },
  impressions: {
    key: "impressions",
    label: "Impressions",
    source: "gsc",
    format: formatCompact,
    formatExact: formatNumber,
    hint: "How often a result appeared in Search.",
  },
  ctr: {
    key: "ctr",
    label: "CTR",
    source: "gsc",
    format: (n) => formatPercent(n, 2),
    formatExact: (n) => formatPercent(n, 2),
    hint: "Clicks divided by impressions.",
  },
  position: {
    key: "position",
    label: "Average Position",
    source: "gsc",
    format: formatPosition,
    formatExact: formatPosition,
    lowerIsBetter: true,
    hint: "Mean ranking, weighted by impressions. Lower is better.",
  },
  users: {
    key: "users",
    label: "Users",
    source: "ga4",
    format: formatCompact,
    formatExact: formatNumber,
    hint: "Distinct people across all channels.",
  },
  newUsers: {
    key: "newUsers",
    label: "New Users",
    source: "ga4",
    format: formatCompact,
    formatExact: formatNumber,
    hint: "Users on their first recorded session.",
  },
  sessions: {
    key: "sessions",
    label: "Sessions",
    source: "ga4",
    format: formatCompact,
    formatExact: formatNumber,
    hint: "Visits, including repeat visits.",
  },
  engagedSessions: {
    key: "engagedSessions",
    label: "Engaged Sessions",
    source: "ga4",
    format: formatCompact,
    formatExact: formatNumber,
    hint: "Sessions over 10s, or with 2+ views or a conversion.",
  },
  views: {
    key: "views",
    label: "Views",
    source: "ga4",
    format: formatCompact,
    formatExact: formatNumber,
    hint: "Total page views.",
  },
  avgEngagementTime: {
    key: "avgEngagementTime",
    label: "Avg. Engagement Time",
    source: "ga4",
    format: formatDuration,
    formatExact: formatDuration,
    hint: "Mean time in focus per session.",
  },
};

/** Card order on the website dashboard — Search Console first, then GA4. */
export const OVERVIEW_METRICS: MetricKey[] = [
  "clicks",
  "impressions",
  "ctr",
  "position",
  "users",
  "newUsers",
  "sessions",
  "engagedSessions",
  "views",
  "avgEngagementTime",
];

export const GSC_METRICS: MetricKey[] = ["clicks", "impressions", "ctr", "position"];

export const GA4_METRICS: MetricKey[] = [
  "users",
  "newUsers",
  "sessions",
  "views",
  "avgEngagementTime",
  "engagedSessions",
];

/**
 * Resolve a signed change into a sentiment.
 *
 * Centralised so "is this delta good?" is decided once — the position metric
 * inverts, and a near-zero change is neutral rather than a fake win.
 */
export function deltaSentiment(
  change: number,
  lowerIsBetter = false,
): "positive" | "negative" | "neutral" {
  if (Math.abs(change) < 0.0005) return "neutral";
  const good = lowerIsBetter ? change < 0 : change > 0;
  return good ? "positive" : "negative";
}

export const SOURCE_LABEL: Record<MetricSource, string> = {
  gsc: "Search Console",
  ga4: "Analytics",
};
