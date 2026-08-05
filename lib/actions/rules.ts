import type { PageRow, QueryRow } from "@/types";
import { formatCompact, formatPercent, formatPosition, truncatePath } from "@/lib/format";
import type { CtrCurve } from "./ctr-curve";
import { impactFromScore, opportunityScore, priorityFromScore } from "./scoring";
import { PRIORITY_RANK, type ActionItem, type Evidence, type RuleInput, type SubjectKind } from "./types";

/**
 * The rules. Each one reads the report and returns candidate actions.
 *
 * Two constraints hold across all of them:
 *
 * 1. **Never fire on a small sample.** Search Console anonymises low-volume
 *    queries and its per-row numbers are noisy at the bottom of the table.
 *    A rule that triggers on 8 impressions produces a card that is technically
 *    accurate and completely useless, and a handful of those destroy trust in
 *    every other card on the page.
 * 2. **Estimate the prize in clicks**, and let `scoring.ts` rank it. No rule
 *    assigns its own priority — see the note there.
 */

/* -------------------------------------------------------------------------- */
/*  Thresholds                                                                 */
/* -------------------------------------------------------------------------- */

/** Below this, Search Console rows are too noisy (and often anonymised) to act on. */
const MIN_IMPRESSIONS = 50;

/** "No clicks at all" needs more evidence than a decline — zero is common and cheap. */
const MIN_IMPRESSIONS_NO_CLICKS = 150;

/** Fractional impression loss that counts as a real decline, not normal wobble. */
const IMPRESSION_DROP = 0.2;

/** Rank positions lost before it counts as a drop. Below this is SERP noise. */
const POSITION_DROP = 2;

/** Only flag drops from a rank that was actually earning — page 3 slipping is moot. */
const MAX_MEANINGFUL_PREV_POSITION = 20;

/** CTR must be under this share of expected before "low CTR" is a fair claim. */
const CTR_GAP_RATIO = 0.6;

/** The classic striking-distance band: close enough that rank work pays off. */
const STRIKING_MIN = 8;
const STRIKING_MAX = 20;

/** Realistic target for a striking-distance page. Top 3 is optimistic; top 5 is not. */
const TARGET_POSITION = 5;

/**
 * A newly-ranking term is only worth surfacing if it landed somewhere it could
 * plausibly climb from. Beyond roughly page three, it is noise.
 */
const MAX_NEW_KEYWORD_POSITION = 30;

/** Click growth that counts as a genuine riser. */
const RISING_TREND = 0.4;
const MIN_CLICKS_RISING = 10;

/** Per-rule cap. Twenty "fix your CTR" cards is a report, not a to-do list. */
const MAX_PER_RULE = 8;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

interface Draft {
  category: ActionItem["category"];
  subjectKind: SubjectKind;
  subject: string;
  problem: string;
  whyItMatters: string;
  recommendedAction: string;
  estimatedClicks: number;
  isRegression: boolean;
  evidence: Evidence[];
}

function finalise(draft: Draft, totalClicks: number): ActionItem {
  const score = opportunityScore(draft.estimatedClicks, totalClicks);
  return {
    ...draft,
    id: `${draft.category}:${draft.subject}`,
    estimatedClicks: Math.round(draft.estimatedClicks),
    opportunityScore: score,
    impact: impactFromScore(score),
    priority: priorityFromScore(score, draft.isRegression),
  };
}

/** Rank by prize size, keep the top slice. */
function top(drafts: Draft[]): Draft[] {
  return drafts.sort((a, b) => b.estimatedClicks - a.estimatedClicks).slice(0, MAX_PER_RULE);
}

/** Display label — paths get truncated, keywords are quoted. */
function label(subject: string, kind: SubjectKind): string {
  return kind === "page" ? truncatePath(subject, 40) : `“${subject}”`;
}

function pct(fraction: number): string {
  return `${Math.abs(Math.round(fraction * 100))}%`;
}

/* -------------------------------------------------------------------------- */
/*  Rules                                                                      */
/* -------------------------------------------------------------------------- */

/** Pages whose impressions fell materially — lost visibility, not lost clicks. */
function losingImpressions(pages: PageRow[]): Draft[] {
  const drafts: Draft[] = [];

  for (const page of pages) {
    if (page.prevImpressions < MIN_IMPRESSIONS) continue;

    const lost = page.prevImpressions - page.impressions;
    if (lost <= page.prevImpressions * IMPRESSION_DROP) continue;

    // Value the lost visibility at the CTR the page actually converts at.
    const estimatedClicks = lost * Math.max(page.ctr, 0.005);
    const drop = lost / page.prevImpressions;

    drafts.push({
      category: "losing-impressions",
      subjectKind: "page",
      subject: page.page,
      problem: `Impressions on ${label(page.page, "page")} fell ${pct(drop)}, from ${formatCompact(page.prevImpressions)} to ${formatCompact(page.impressions)}.`,
      whyItMatters:
        "Fewer impressions means the page is surfacing for fewer searches than it used to — it is losing ground before anyone gets the chance to click.",
      recommendedAction:
        "Check whether the page slipped in rank or lost keyword coverage. Compare its query list against last period, refresh thin or dated sections, and confirm nothing broke in internal linking.",
      estimatedClicks,
      isRegression: true,
      evidence: [
        { label: "Impressions", value: `${formatCompact(page.prevImpressions)} → ${formatCompact(page.impressions)}`, tone: "negative" },
        { label: "Clicks", value: `${formatCompact(page.prevClicks)} → ${formatCompact(page.clicks)}`, tone: page.clicks < page.prevClicks ? "negative" : undefined },
        { label: "Position", value: formatPosition(page.position) },
      ],
    });
  }

  return top(drafts);
}

/** Keywords that lost rank from a position that was earning traffic. */
function positionDrops(queries: QueryRow[], curve: CtrCurve): Draft[] {
  const drafts: Draft[] = [];

  for (const query of queries) {
    // `prevPosition` is 0 for a row absent last period, which would read as a
    // perfect rank and manufacture an enormous fake drop.
    if (query.prevImpressions < MIN_IMPRESSIONS) continue;
    if (query.prevPosition <= 0 || query.prevPosition > MAX_MEANINGFUL_PREV_POSITION) continue;

    const lost = query.position - query.prevPosition;
    if (lost < POSITION_DROP) continue;

    // Clicks forgone by ranking where it now ranks instead of where it did.
    const estimatedClicks =
      query.impressions * Math.max(0, curve.at(query.prevPosition) - curve.at(query.position));

    drafts.push({
      category: "position-drop",
      subjectKind: "keyword",
      subject: query.keyword,
      problem: `${label(query.keyword, "keyword")} dropped ${lost.toFixed(1)} positions, from ${formatPosition(query.prevPosition)} to ${formatPosition(query.position)}.`,
      whyItMatters:
        "Click-through falls steeply with rank, so a drop of even a couple of places near the top of the results costs disproportionately more traffic than the number suggests.",
      recommendedAction:
        "Identify the page targeting this term and check what displaced it. Refresh the content against the pages now outranking you, strengthen internal links pointing at it, and confirm the term is still covered prominently on the page.",
      estimatedClicks,
      isRegression: true,
      evidence: [
        { label: "Position", value: `${formatPosition(query.prevPosition)} → ${formatPosition(query.position)}`, tone: "negative" },
        { label: "Impressions", value: formatCompact(query.impressions) },
        { label: "Clicks", value: `${formatCompact(query.prevClicks)} → ${formatCompact(query.clicks)}`, tone: query.clicks < query.prevClicks ? "negative" : undefined },
      ],
    });
  }

  return top(drafts);
}

/** Pages seen often but clicked rarely for where they rank. */
function ctrGaps(pages: PageRow[], curve: CtrCurve): Draft[] {
  const drafts: Draft[] = [];

  for (const page of pages) {
    if (page.impressions < MIN_IMPRESSIONS) continue;
    // Zero clicks is the extreme case of this, and `noClicks` owns it — running
    // both would emit two cards about one page.
    if (page.clicks === 0) continue;

    const expected = curve.at(page.position);
    if (page.ctr >= expected * CTR_GAP_RATIO) continue;

    const estimatedClicks = page.impressions * (expected - page.ctr);

    drafts.push({
      category: "ctr-gap",
      subjectKind: "page",
      subject: page.page,
      problem: `${label(page.page, "page")} draws ${formatCompact(page.impressions)} impressions at position ${formatPosition(page.position)} but converts only ${formatPercent(page.ctr)} — against ${formatPercent(expected)} typical for that rank on this site.`,
      whyItMatters:
        "The ranking work is already done: people are seeing this page and choosing something else. That is a title and snippet problem, and it is among the cheapest things to fix.",
      recommendedAction:
        "Rewrite the title tag and meta description to match what searchers are actually asking. Lead with the specific answer, keep the title under roughly 60 characters so it is not truncated, and add structured data if a rich result applies.",
      estimatedClicks,
      isRegression: false,
      evidence: [
        { label: "CTR", value: `${formatPercent(page.ctr)} vs ${formatPercent(expected)} expected`, tone: "negative" },
        { label: "Impressions", value: formatCompact(page.impressions) },
        { label: "Position", value: formatPosition(page.position) },
      ],
    });
  }

  return top(drafts);
}

/** Pages just off the first page, where rank gains convert hardest. */
function strikingDistance(pages: PageRow[], curve: CtrCurve): Draft[] {
  const drafts: Draft[] = [];

  for (const page of pages) {
    if (page.impressions < MIN_IMPRESSIONS) continue;
    if (page.position < STRIKING_MIN || page.position > STRIKING_MAX) continue;

    const estimatedClicks =
      page.impressions * Math.max(0, curve.at(TARGET_POSITION) - page.ctr);

    drafts.push({
      category: "striking-distance",
      subjectKind: "page",
      subject: page.page,
      problem: `${label(page.page, "page")} sits at position ${formatPosition(page.position)} with ${formatCompact(page.impressions)} impressions — close to the first page but not on it.`,
      whyItMatters:
        "This is the highest-leverage band on the site. The page already ranks and already has demand behind it; moving it a few places crosses into where the clicks actually are.",
      recommendedAction:
        `Push this toward the top ${TARGET_POSITION}. Expand the sections that only partly answer the query, add internal links from your strongest related pages, and cover the specific sub-questions its query list shows people asking.`,
      estimatedClicks,
      isRegression: false,
      evidence: [
        { label: "Position", value: formatPosition(page.position) },
        { label: "Impressions", value: formatCompact(page.impressions) },
        { label: "CTR", value: formatPercent(page.ctr) },
      ],
    });
  }

  return top(drafts);
}

/** Pages with real visibility and not one click. */
function noClicks(pages: PageRow[], curve: CtrCurve): Draft[] {
  const drafts: Draft[] = [];

  for (const page of pages) {
    if (page.clicks !== 0) continue;
    if (page.impressions < MIN_IMPRESSIONS_NO_CLICKS) continue;

    const estimatedClicks = page.impressions * curve.at(page.position);

    drafts.push({
      category: "no-clicks",
      subjectKind: "page",
      subject: page.page,
      problem: `${label(page.page, "page")} was shown ${formatCompact(page.impressions)} times and received no clicks at all, at position ${formatPosition(page.position)}.`,
      whyItMatters:
        "Demand and visibility both exist, and none of it converts. Either the page ranks too low to be seen properly, or the result itself gives searchers no reason to choose it.",
      recommendedAction:
        page.position > STRIKING_MAX
          ? "It ranks too low to earn clicks at this position. Decide whether the page is worth a serious rank push, or whether it should be consolidated into a stronger page on the same topic."
          : "It ranks well enough to be clicked, so the result is the problem. Rewrite the title and description, and check the query list — the page may be surfacing for searches it does not actually answer.",
      estimatedClicks,
      isRegression: false,
      evidence: [
        { label: "Impressions", value: formatCompact(page.impressions) },
        { label: "Clicks", value: "0", tone: "negative" },
        { label: "Position", value: formatPosition(page.position) },
      ],
    });
  }

  return top(drafts);
}

/** Terms the site ranks for now that it did not rank for last period. */
function newKeywords(queries: QueryRow[], curve: CtrCurve): Draft[] {
  const drafts: Draft[] = [];

  for (const query of queries) {
    // `isNew` rather than `prevImpressions === 0`: the latter also catches rows
    // that merely fell below Search Console's row cap last period, which on a
    // large site is most of the long tail. See `PreviousRowMetrics.isNew`.
    if (!query.isNew) continue;
    if (query.impressions < MIN_IMPRESSIONS) continue;
    // Ranking on page four is not an opportunity, it is a curiosity. Modelling
    // a jump to the top 5 from there would promise clicks that are not coming.
    if (query.position > MAX_NEW_KEYWORD_POSITION) continue;

    const estimatedClicks =
      query.impressions * Math.max(0, curve.at(TARGET_POSITION) - query.ctr);

    drafts.push({
      category: "new-keyword",
      subjectKind: "keyword",
      subject: query.keyword,
      problem: `${label(query.keyword, "keyword")} started ranking this period with ${formatCompact(query.impressions)} impressions at position ${formatPosition(query.position)}. It drew none last period.`,
      whyItMatters:
        "A term that has just started surfacing is unclaimed ground. Early reinforcement is far cheaper than trying to break into an established ranking later.",
      recommendedAction:
        "Find the page picking this term up and make it deliberate. Cover the term explicitly, and if it is a strong fit but sits on a page only loosely about it, consider a dedicated page.",
      estimatedClicks,
      isRegression: false,
      evidence: [
        { label: "Impressions", value: formatCompact(query.impressions) },
        { label: "Position", value: formatPosition(query.position) },
        { label: "Status", value: "New this period", tone: "positive" },
      ],
    });
  }

  return top(drafts);
}

/** Queries growing fastest — momentum worth reinforcing. */
function risingQueries(queries: QueryRow[]): Draft[] {
  const drafts: Draft[] = [];

  for (const query of queries) {
    // Genuine growth needs a baseline; a brand-new term is `newKeywords`' job.
    if (query.prevImpressions === 0) continue;
    if (query.clicks < MIN_CLICKS_RISING) continue;
    if (query.trend < RISING_TREND) continue;

    const gained = query.clicks - query.prevClicks;
    if (gained <= 0) continue;

    drafts.push({
      category: "rising-query",
      subjectKind: "keyword",
      subject: query.keyword,
      problem: `${label(query.keyword, "keyword")} grew ${pct(query.trend)}, from ${formatCompact(query.prevClicks)} to ${formatCompact(query.clicks)} clicks.`,
      whyItMatters:
        "Something about this term is working. Growth compounds while it lasts, and it is far easier to extend a rising term than to revive a flat one.",
      recommendedAction:
        "Double down while the momentum holds. Expand the page that owns this term, cover the closely related variants it is pulling in, and link to it from your strongest pages.",
      // The prize is the growth already demonstrated — a reasonable proxy for
      // what continued investment could repeat.
      estimatedClicks: gained,
      isRegression: false,
      evidence: [
        { label: "Clicks", value: `${formatCompact(query.prevClicks)} → ${formatCompact(query.clicks)}`, tone: "positive" },
        { label: "Growth", value: `+${pct(query.trend)}`, tone: "positive" },
        { label: "Position", value: formatPosition(query.position) },
      ],
    });
  }

  return top(drafts);
}

/* -------------------------------------------------------------------------- */
/*  Engine                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Run every rule and return actions sorted by priority, then by prize size.
 *
 * `not-indexed` is absent by design — see the note on `ActionCategory`.
 */
export function runRules(input: RuleInput, curve: CtrCurve): ActionItem[] {
  const { queries, pages, totalClicks } = input;

  const drafts: Draft[] = [
    ...losingImpressions(pages),
    ...positionDrops(queries, curve),
    ...ctrGaps(pages, curve),
    ...strikingDistance(pages, curve),
    ...noClicks(pages, curve),
    ...newKeywords(queries, curve),
    ...risingQueries(queries),
  ];

  return drafts
    .map((draft) => finalise(draft, totalClicks))
    // Drop findings whose modelled prize rounds to nothing — they are real but
    // not worth anyone's afternoon.
    .filter((action) => action.estimatedClicks >= 1)
    // Priority first, then score. Priority carries the regression bonus, so
    // sorting by score alone would strand a High card below a Medium one.
    .sort(
      (a, b) =>
        PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
        b.opportunityScore - a.opportunityScore ||
        b.estimatedClicks - a.estimatedClicks,
    );
}
