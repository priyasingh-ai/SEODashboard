import type { SiteReportData } from "@/services/types";
import { fitCtrCurve } from "./ctr-curve";
import { runRules } from "./rules";
import type { ActionCategory, ActionItem, ActionReport, ActionSummary } from "./types";

export * from "./types";
export { toStars, IMPACT_LABEL, PRIORITY_LABEL } from "./scoring";
export { fitCtrCurve } from "./ctr-curve";
export type { CtrCurve } from "./ctr-curve";

/**
 * The Action Center's public entry point.
 *
 * Derives the whole report from data the dashboard has already fetched — the
 * existing `site-report` response. That is a deliberate architectural choice:
 * no new endpoint, no new Google quota, and the answer arrives on a warm cache
 * rather than after a fresh round trip. It also means the analysis stays a pure
 * function of what the rest of the dashboard is showing, so a card can never
 * contradict the table beneath it.
 */

const EMPTY_BY_CATEGORY: Record<ActionCategory, number> = {
  "losing-impressions": 0,
  "position-drop": 0,
  "ctr-gap": 0,
  "striking-distance": 0,
  "no-clicks": 0,
  "new-keyword": 0,
  "rising-query": 0,
  "not-indexed": 0,
};

/**
 * Below this there is not enough signal to say anything responsible.
 *
 * A brand-new property, or a window ending inside Search Console's 2–3 day
 * reporting lag, will produce a handful of rows whose rates swing wildly. Better
 * to say "not enough data yet" than to publish a confident to-do list built on
 * four impressions.
 */
const MIN_IMPRESSIONS_FOR_ANALYSIS = 200;

export function summarise(actions: ActionItem[], insufficientData = false): ActionSummary {
  const byCategory = { ...EMPTY_BY_CATEGORY };
  for (const action of actions) byCategory[action.category] += 1;

  return {
    total: actions.length,
    high: actions.filter((a) => a.priority === "high").length,
    medium: actions.filter((a) => a.priority === "medium").length,
    low: actions.filter((a) => a.priority === "low").length,
    byCategory,
    estimatedClicks: actions.reduce((sum, a) => sum + a.estimatedClicks, 0),
    insufficientData,
  };
}

export function buildActionReport(report: SiteReportData): ActionReport {
  const { site, queries, pages } = report;

  const totalImpressions = pages.reduce((sum, p) => sum + p.impressions, 0);
  const totalClicks = pages.reduce((sum, p) => sum + p.clicks, 0);

  if (totalImpressions < MIN_IMPRESSIONS_FOR_ANALYSIS) {
    return { site, actions: [], summary: summarise([], true) };
  }

  // Fit the CTR curve on queries and pages together: more observations means
  // less weight on the generic baseline, and the two describe the same site.
  const curve = fitCtrCurve([
    ...queries.map((q) => ({ position: q.position, ctr: q.ctr, impressions: q.impressions })),
    ...pages.map((p) => ({ position: p.position, ctr: p.ctr, impressions: p.impressions })),
  ]);

  const actions = runRules({ queries, pages, totalClicks, totalImpressions }, curve);

  return { site, actions, summary: summarise(actions) };
}
