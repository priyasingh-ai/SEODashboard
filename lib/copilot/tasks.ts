import type { ActionCategory, ActionItem } from "@/lib/actions/types";
import { formatCompact, formatNumber, formatPercent, truncatePath } from "@/lib/format";
import type { AnalyticsInsights } from "@/types";
import type { CopilotTask, Effort, Horizon } from "./types";

/**
 * Scheduling: turning a ranked list into three lists with different half-lives.
 *
 * A priority-sorted backlog is not a plan. The first item might be a three-week
 * template migration and the fourth a title rewrite worth doing before lunch —
 * ranking alone gives no way to see that. So each finding is scheduled on two
 * axes: how much it is worth (already computed by the Action Center's scoring)
 * and how much work it is (this file).
 *
 * `Today` is deliberately kept small and uniformly *quick*. A "today" list of
 * fourteen items is a backlog wearing a hat, and it gets ignored the same way.
 */

/* -------------------------------------------------------------------------- */
/*  Effort model                                                               */
/* -------------------------------------------------------------------------- */

/**
 * How much work each category's fix actually is.
 *
 * Assigned per category rather than per item because effort is a property of
 * the *remedy*, and every item in a category shares one. A CTR gap is always
 * "rewrite the title and description"; a striking-distance keyword is always
 * "strengthen the page's coverage of it".
 */
const EFFORT: Record<ActionCategory, Effort> = {
  "ctr-gap": "quick",
  "new-keyword": "quick",
  "rising-query": "quick",
  "not-indexed": "quick",
  "striking-distance": "moderate",
  "position-drop": "moderate",
  "losing-impressions": "moderate",
  "no-clicks": "moderate",
};

/** Caps. Past these a list stops being read. */
const LIMITS: Record<Horizon, number> = { today: 5, week: 8, month: 6 };

/** Today's list is padded down to medium priority rather than left near-empty. */
const MIN_TODAY = 3;

/**
 * A category needs this many *unscheduled* leftovers before it becomes a
 * monthly programme. Below it, "run a title audit" describes two pages, and
 * calling that a programme is inflation.
 */
const PROGRAMME_MIN = 4;

/** Analytics floors, matching the narrative module's. */
const MIN_SESSIONS = 50;
const CONCENTRATION = 0.7;

/* -------------------------------------------------------------------------- */
/*  Search-derived tasks                                                       */
/* -------------------------------------------------------------------------- */

function fromAction(item: ActionItem, horizon: Horizon): CopilotTask {
  return {
    id: `task:${item.id}`,
    horizon,
    effort: EFFORT[item.category],
    title: item.recommendedAction,
    why: item.problem,
    priority: item.priority,
    impact: item.impact,
    estimatedClicks: item.estimatedClicks,
    subject: item.subject,
    subjectKind: item.subjectKind,
    source: "search-console",
  };
}

const PROGRAMME_COPY: Record<ActionCategory, { title: (n: number) => string; why: string }> = {
  "ctr-gap": {
    title: (n) => `Run a title and meta description audit across ${n} more pages`,
    why: "Each ranks well enough to be seen but is clicked less than its position predicts, which is the pattern a batch rewrite fixes faster than one-by-one edits.",
  },
  "striking-distance": {
    title: (n) => `Plan a content strengthening pass over ${n} more page-and-keyword pairs`,
    why: "All sit just outside the positions that draw meaningful clicks, where added depth and internal links move the needle more reliably than anywhere else on the site.",
  },
  "position-drop": {
    title: (n) => `Investigate what ${n} more declining pages have in common`,
    why: "Several pages losing rank in one window is more often one shared cause — a template change, a lost link source, a competitor's new content — than several independent ones.",
  },
  "losing-impressions": {
    title: (n) => `Review declining reach across ${n} more pages`,
    why: "Impressions falling ahead of clicks means the pages are being shown for fewer searches, which shows up in rankings weeks before it shows up in traffic.",
  },
  "no-clicks": {
    title: (n) => `Decide whether to improve or retire ${n} more pages drawing no clicks`,
    why: "Pages that draw impressions and no clicks either target the wrong intent or are outmatched on the results page. Both are decisions, not edits.",
  },
  "new-keyword": {
    title: (n) => `Build out coverage for ${n} more newly ranking keywords`,
    why: "The site is already surfacing for these without a page aimed at them, which is the cheapest signal that dedicated coverage would rank.",
  },
  "rising-query": {
    title: (n) => `Expand ${n} more queries growing faster than the site average`,
    why: "Rising demand the site already has a foothold in compounds if it is met, and decays to a competitor if it is not.",
  },
  "not-indexed": {
    title: (n) => `Resolve indexing for ${n} more pages`,
    why: "Pages Google has not indexed cannot rank at all, so this precedes every other optimisation on them.",
  },
};

/**
 * Roll a category's unscheduled leftovers into one monthly theme.
 *
 * The estimate is the honest sum of the individual estimates, and the priority
 * is the strongest among them rather than an average — a programme containing
 * one very high-value page is worth as much as that page.
 */
function programme(category: ActionCategory, leftovers: ActionItem[]): CopilotTask {
  const copy = PROGRAMME_COPY[category];
  const strongest = leftovers.reduce((best, item) =>
    item.opportunityScore > best.opportunityScore ? item : best,
  );

  return {
    id: `task:programme:${category}`,
    horizon: "month",
    effort: "project",
    title: copy.title(leftovers.length),
    why: copy.why,
    priority: strongest.priority,
    impact: strongest.impact,
    estimatedClicks: leftovers.reduce((sum, i) => sum + i.estimatedClicks, 0),
    subject: `${leftovers.length} pages`,
    subjectKind: strongest.subjectKind,
    source: "search-console",
    isProgramme: true,
  };
}

/* -------------------------------------------------------------------------- */
/*  Analytics-derived tasks                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Structural findings from GA4.
 *
 * None of these carry a click estimate, and that is not an oversight. The
 * Action Center's estimates come from a CTR curve fitted to this site's own
 * search data; there is no equivalent curve mapping "engagement rate improved
 * by X" to clicks. Rather than borrow the search model for a number it was not
 * built to produce, these tasks carry a priority and no forecast.
 */
function analyticsTasks(insights: AnalyticsInsights | undefined): CopilotTask[] {
  if (!insights) return [];
  const tasks: CopilotTask[] = [];

  if (insights.conversions.notConfigured) {
    tasks.push({
      id: "task:ga4-key-events",
      horizon: "month",
      effort: "project",
      title: "Mark at least one key event in GA4 so conversions become measurable",
      why: "The property reports no key events at all, so every recommendation on this dashboard is currently optimising for traffic with no way to check whether that traffic does anything.",
      priority: "high",
      impact: "high",
      subject: "GA4 configuration",
      subjectKind: "page",
      source: "analytics",
      isProgramme: true,
    });
  }

  const dominant = insights.channels.find((c) => c.share >= CONCENTRATION);
  if (dominant && insights.engagement.sessions >= MIN_SESSIONS) {
    tasks.push({
      id: "task:channel-concentration",
      horizon: "month",
      effort: "project",
      title: `Reduce dependence on ${dominant.label}, which carries ${formatPercent(dominant.share, 0)} of sessions`,
      why: `${formatCompact(dominant.sessions)} of ${formatCompact(insights.engagement.sessions)} sessions arrive through one channel. That is a concentration risk rather than a fault — but a single ranking or policy change would take most of the site's traffic with it.`,
      priority: "medium",
      impact: "high",
      subject: dominant.label,
      subjectKind: "page",
      source: "analytics",
      isProgramme: true,
    });
  }

  // The single landing page losing the most sessions to non-engagement. One,
  // not a list: past the first, the recommendation is identical and the reader
  // has already got the point.
  const worst = insights.dropOff
    .filter((d) => d.sessions >= MIN_SESSIONS)
    .sort((a, b) => b.lostSessions - a.lostSessions)[0];

  if (worst) {
    tasks.push({
      id: `task:dropoff:${worst.page}`,
      horizon: "week",
      effort: "moderate",
      title: `Rework the opening of ${truncatePath(worst.page)} to hold arriving sessions`,
      why: `${formatNumber(Math.round(worst.lostSessions))} of ${formatCompact(worst.sessions)} sessions land here and leave without engaging — ${formatPercent(worst.bounceRate, 0)} of them. The page is winning the click and losing the visit.`,
      priority: "medium",
      impact: "medium",
      subject: worst.page,
      subjectKind: "page",
      source: "analytics",
    });
  }

  return tasks;
}

/* -------------------------------------------------------------------------- */

export function scheduleTasks(
  actions: ActionItem[],
  insights: AnalyticsInsights | undefined,
): Record<Horizon, CopilotTask[]> {
  const scheduled = new Set<string>();
  const take = (predicate: (item: ActionItem) => boolean, limit: number): ActionItem[] => {
    const picked = actions.filter((a) => !scheduled.has(a.id) && predicate(a)).slice(0, limit);
    for (const item of picked) scheduled.add(item.id);
    return picked;
  };

  // Today: quick and high-value first, then padded with quick medium-value work
  // so the list is never so short it looks broken on a healthy site.
  const today = take((a) => EFFORT[a.category] === "quick" && a.priority === "high", LIMITS.today);
  if (today.length < MIN_TODAY) {
    today.push(
      ...take(
        (a) => EFFORT[a.category] === "quick" && a.priority === "medium",
        MIN_TODAY - today.length,
      ),
    );
  }

  const week = take((a) => a.priority === "high" || a.priority === "medium", LIMITS.week);

  // Whatever is left, grouped by category. Only categories with enough
  // leftovers to constitute a pattern become programmes; the rest simply do not
  // appear, rather than being padded into the monthly list.
  const leftovers = new Map<ActionCategory, ActionItem[]>();
  for (const action of actions) {
    if (scheduled.has(action.id)) continue;
    leftovers.set(action.category, [...(leftovers.get(action.category) ?? []), action]);
  }

  const analytics = analyticsTasks(insights);

  const month = [
    ...[...leftovers.entries()]
      .filter(([, items]) => items.length >= PROGRAMME_MIN)
      .map(([category, items]) => programme(category, items)),
    ...analytics.filter((t) => t.horizon === "month"),
  ]
    .sort((a, b) => (b.estimatedClicks ?? 0) - (a.estimatedClicks ?? 0))
    .slice(0, LIMITS.month);

  return {
    today: today.map((a) => fromAction(a, "today")),
    week: [
      ...week.map((a) => fromAction(a, "week")),
      ...analytics.filter((t) => t.horizon === "week"),
    ].slice(0, LIMITS.week),
    month,
  };
}
