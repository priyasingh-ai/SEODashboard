import type { Impact, Priority } from "./types";

/**
 * Turning an estimated click gain into a score, an impact tier and a priority.
 *
 * One rule governs this file: every ranking decision is grounded in *modelled
 * clicks*, never in the raw size of a percentage. A page whose CTR fell 80% is
 * irrelevant if it draws 30 impressions a month, and a 4% CTR slip on a page
 * with 400,000 impressions outranks almost anything else. Sorting by percentage
 * change is the single most common way these dashboards end up worthless, and
 * it is worth the extra arithmetic to avoid.
 */

/**
 * Clicks are scored as a share of the site's own total, so a 900-click site and
 * a 900,000-click site both get a usable spread instead of everything pinning
 * to one end.
 *
 * Consequence worth stating plainly: scores are comparable *within* one site
 * and one window, and are not comparable across sites. The UI says so too.
 */
const SATURATION = 0.05;

/**
 * Denominator floor.
 *
 * Without it, a site with 6 total clicks scores every trivial finding 100/100.
 * A brand-new property should show modest scores, not a wall of red.
 */
const MIN_DENOMINATOR = 50;

/** Regressions outrank equivalent-sized opportunities: lost ground is compounding. */
const REGRESSION_BONUS = 12;

/**
 * Map an estimated click gain to 0–100.
 *
 * Saturating exponential rather than linear: the difference between 1% and 6%
 * of site traffic is decision-relevant, the difference between 60% and 65% is
 * not — both are "drop everything".
 */
export function opportunityScore(estimatedClicks: number, totalClicks: number): number {
  if (!Number.isFinite(estimatedClicks) || estimatedClicks <= 0) return 0;

  const share = estimatedClicks / Math.max(totalClicks, MIN_DENOMINATOR);
  const score = 100 * (1 - Math.exp(-share / SATURATION));

  // Floor at 1 so a real-but-small finding never renders as a bare "0".
  return Math.max(1, Math.min(100, Math.round(score)));
}

/** Five-star rendering of a 0–100 score. Always at least one star. */
export function toStars(score: number): number {
  return Math.max(1, Math.min(5, Math.ceil(score / 20)));
}

export function impactFromScore(score: number): Impact {
  if (score >= 75) return "very-high";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

/**
 * Priority = size of the prize, nudged up when it is ground already lost.
 *
 * Deliberately derived rather than hand-assigned per rule: if each rule picked
 * its own priority, "high" would mean something different in every card and the
 * sort order across categories would be meaningless.
 */
export function priorityFromScore(score: number, isRegression: boolean): Priority {
  const adjusted = score + (isRegression ? REGRESSION_BONUS : 0);
  if (adjusted >= 60) return "high";
  if (adjusted >= 30) return "medium";
  return "low";
}

export const IMPACT_LABEL: Record<Impact, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  "very-high": "Very High",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
