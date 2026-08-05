"use client";

import { AlertTriangle, DatabaseZap, Inbox, PlugZap } from "lucide-react";
import { ApiError } from "@/lib/api";
import { EmptyState } from "./empty-state";

/**
 * The three ways a data panel can fail to show numbers.
 *
 * Keeping them distinct matters: "this property isn't connected yet",
 * "Google is erroring" and "the window is genuinely empty" call for completely
 * different reactions from whoever is reading the dashboard, and collapsing
 * them into one grey box hides the difference.
 */

/** A request that failed. Reads the server's error code to pick the message. */
export function ErrorState({ error, subject }: { error: Error; subject: string }) {
  const api = error instanceof ApiError ? error : undefined;

  if (api?.isNotConfigured) {
    return (
      <EmptyState
        icon={PlugZap}
        title="Not connected yet"
        description={`${subject} has no Google Analytics or Search Console property bound. Add the credentials and property ids to your environment, then set DATA_SOURCE=google.`}
      />
    );
  }

  if (api?.code === "rate_limited") {
    return (
      <EmptyState
        icon={DatabaseZap}
        title="Google is rate limiting us"
        description="The API quota for this property is exhausted. Data will load again shortly — try refreshing in a minute."
      />
    );
  }

  if (api?.code === "unauthorized") {
    return (
      <EmptyState
        icon={PlugZap}
        title="Access denied"
        description="The service account can't read this property. Share the GA4 property and the Search Console site with it, then refresh."
      />
    );
  }

  return (
    <EmptyState
      icon={AlertTriangle}
      title={`Couldn't load ${subject}`}
      description={error.message}
    />
  );
}

/**
 * A successful response that contains nothing.
 *
 * Distinct from an error: the request worked, the window is just empty. Common
 * on a brand-new property, or on Search Console's most recent 2–3 days, which
 * always lag.
 */
export function NoDataState({
  subject = "data",
  description,
}: {
  subject?: string;
  description?: string;
}) {
  return (
    <EmptyState
      icon={Inbox}
      title="No Data Available"
      description={
        description ??
        `No ${subject} was reported for this period. Try a wider date range — Search Console also lags 2–3 days behind today.`
      }
    />
  );
}

/** True when a response came back successfully but carries no rows at all. */
export function isEmptyReport(report: {
  timeseries?: unknown[];
  queries?: unknown[];
  pages?: unknown[];
  rows?: unknown[];
}): boolean {
  const buckets = [report.timeseries, report.queries, report.pages, report.rows].filter(
    Array.isArray,
  );
  return buckets.length > 0 && buckets.every((b) => b.length === 0);
}
