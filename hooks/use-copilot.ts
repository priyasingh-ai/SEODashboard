"use client";

import * as React from "react";
import { buildBrief, type CopilotBrief } from "@/lib/copilot";
import { useAnalyticsInsights, useKeywordMovement, useSiteReport } from "./use-reports";
import type { AsyncState } from "./use-async";

/**
 * The Copilot's data hook.
 *
 * Composes three endpoints the rest of the dashboard already loads, all of them
 * behind the same keyed cache — so arriving here from Search Console or
 * Analytics usually costs nothing at all.
 *
 * Only the site report is required. Analytics insights and keyword movement are
 * *optional inputs*: a GA4 property that is not connected, or a movement query
 * that failed, must degrade the brief rather than replace it with an error
 * page. Search Console alone is enough to say something useful, and what the
 * brief could not see is reported in `coverage` instead of being passed off as
 * an absence of findings.
 */
export function useCopilot(websiteId?: string): AsyncState<CopilotBrief> {
  const report = useSiteReport(websiteId);
  const insights = useAnalyticsInsights(websiteId);
  const movement = useKeywordMovement("week", websiteId);

  const brief = React.useMemo(
    () =>
      report.data
        ? buildBrief({
            report: report.data,
            insights: insights.data,
            movement: movement.data,
          })
        : undefined,
    [report.data, insights.data, movement.data],
  );

  const refresh = React.useCallback(() => {
    report.refresh();
    insights.refresh();
    movement.refresh();
  }, [report, insights, movement]);

  return {
    data: brief,
    // Only the required input can fail the page.
    error: report.error,
    isLoading: report.isLoading,
    // The optional inputs still count as refreshing, so the brief does not look
    // settled while a section of it is still on its way.
    isRefreshing: report.isRefreshing || insights.isLoading || movement.isLoading,
    refresh,
  };
}
