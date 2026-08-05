import type { PageRow, QueryRow } from "@/types";
import { fitCtrCurve, type CtrCurve } from "@/lib/actions/ctr-curve";

/**
 * Derived Search Console analysis.
 *
 * Pure functions over data the page has already fetched — no API surface, no
 * extra Google quota. Shares the CTR curve with the Action Center rather than
 * carrying a second opinion about what CTR is normal at a given rank, so the
 * two sections can never contradict each other on the same site.
 */

/* -------------------------------------------------------------------------- */
/*  Thresholds                                                                 */
/* -------------------------------------------------------------------------- */

/** The striking-distance band: ranking, but not where the clicks are. */
const QUICK_WIN_MIN_POSITION = 8;
const QUICK_WIN_MAX_POSITION = 20;

/** Below this, Search Console rates are too noisy to call anything an opportunity. */
const MIN_IMPRESSIONS = 25;

/** A realistic target rank for a striking-distance term. */
const TARGET_POSITION = 5;

/** How far under expected CTR before a page is worth a title rewrite. */
const CTR_GAP_RATIO = 0.7;

/* -------------------------------------------------------------------------- */
/*  Site baselines                                                             */
/* -------------------------------------------------------------------------- */

export interface SearchBaseline {
  /** Σclicks / Σimpressions — the true site CTR, not a mean of per-row rates. */
  averageCtr: number;
  averageImpressions: number;
  averagePosition: number;
  totalClicks: number;
  totalImpressions: number;
  curve: CtrCurve;
}

/**
 * Site-level baselines, from queries and pages together.
 *
 * `averageCtr` is weighted, deliberately. Averaging per-row CTRs gives every
 * long-tail query with three impressions the same vote as the head term with
 * thirty thousand, which inflates the baseline and then flags healthy pages as
 * underperforming against it.
 *
 * `averagePosition` is impression-weighted for the same reason: an unweighted
 * mean is dominated by the tail, where almost nobody ever sees the result.
 */
export function searchBaseline(queries: QueryRow[], pages: PageRow[]): SearchBaseline {
  const rows = [
    ...queries.map((q) => ({ clicks: q.clicks, impressions: q.impressions, position: q.position, ctr: q.ctr })),
    ...pages.map((p) => ({ clicks: p.clicks, impressions: p.impressions, position: p.position, ctr: p.ctr })),
  ];

  const totalClicks = rows.reduce((t, r) => t + r.clicks, 0);
  const totalImpressions = rows.reduce((t, r) => t + r.impressions, 0);
  const weightedPosition = rows.reduce((t, r) => t + r.position * r.impressions, 0);

  return {
    averageCtr: totalImpressions === 0 ? 0 : totalClicks / totalImpressions,
    averageImpressions: rows.length === 0 ? 0 : totalImpressions / rows.length,
    averagePosition: totalImpressions === 0 ? 0 : weightedPosition / totalImpressions,
    totalClicks,
    totalImpressions,
    curve: fitCtrCurve(rows),
  };
}

/* -------------------------------------------------------------------------- */
/*  Query opportunities                                                        */
/* -------------------------------------------------------------------------- */

export interface QueryOpportunity {
  keyword: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  /** What this site typically converts at this rank. */
  expectedCtr: number;
  /** Modelled clicks from reaching the target position. */
  potentialClicks: number;
  /** Met all three criteria: striking distance, above-average volume, weak CTR. */
  isQuickWin: boolean;
  /** Which criteria matched, for the "why" column. */
  reasons: string[];
}

/**
 * Queries worth working on next, quick wins flagged.
 *
 * A quick win is the intersection of three conditions — position 8–20,
 * above-average impressions, below-average CTR. The intersection matters: any
 * one of them alone is a long list of noise, and it is their overlap that
 * identifies a term with proven demand, proven ranking ability, and an
 * unclaimed gap.
 */
export function queryOpportunities(
  queries: QueryRow[],
  baseline: SearchBaseline,
): QueryOpportunity[] {
  return queries
    .filter((q) => q.impressions >= MIN_IMPRESSIONS)
    .map((query) => {
      const expectedCtr = baseline.curve.at(query.position);

      const inBand =
        query.position >= QUICK_WIN_MIN_POSITION && query.position <= QUICK_WIN_MAX_POSITION;
      const highVolume = query.impressions > baseline.averageImpressions;
      const weakCtr = query.ctr < baseline.averageCtr;

      const reasons: string[] = [];
      if (inBand) reasons.push("Position 8–20");
      if (highVolume) reasons.push("Above-average impressions");
      if (weakCtr) reasons.push("Below-average CTR");

      return {
        keyword: query.keyword,
        clicks: query.clicks,
        impressions: query.impressions,
        ctr: query.ctr,
        position: query.position,
        expectedCtr,
        potentialClicks: Math.round(
          query.impressions * Math.max(0, baseline.curve.at(TARGET_POSITION) - query.ctr),
        ),
        isQuickWin: inBand && highVolume && weakCtr,
        reasons,
      };
    })
    .sort(
      (a, b) =>
        Number(b.isQuickWin) - Number(a.isQuickWin) || b.potentialClicks - a.potentialClicks,
    );
}

/* -------------------------------------------------------------------------- */
/*  CTR analysis                                                               */
/* -------------------------------------------------------------------------- */

export interface CtrFinding {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  expectedCtr: number;
  /** Signed: negative means below what this rank normally earns. */
  ctrGap: number;
  /** Clicks recoverable by closing the gap. */
  potentialClicks: number;
}

/**
 * Pages seen far more often than they are clicked.
 *
 * Ranked by recoverable clicks rather than by the size of the CTR shortfall: a
 * 90% shortfall on 40 impressions is arithmetic, not an opportunity, and
 * sorting by percentage would put it above a 30% shortfall on 40,000.
 */
export function ctrFindings(pages: PageRow[], baseline: SearchBaseline): CtrFinding[] {
  return pages
    .filter((p) => p.impressions >= MIN_IMPRESSIONS)
    .map((page) => {
      const expectedCtr = baseline.curve.at(page.position);
      return {
        page: page.page,
        clicks: page.clicks,
        impressions: page.impressions,
        ctr: page.ctr,
        position: page.position,
        expectedCtr,
        ctrGap: page.ctr - expectedCtr,
        potentialClicks: Math.round(page.impressions * Math.max(0, expectedCtr - page.ctr)),
      };
    })
    .filter((f) => f.ctr < f.expectedCtr * CTR_GAP_RATIO && f.potentialClicks >= 1)
    .sort((a, b) => b.potentialClicks - a.potentialClicks);
}

/* -------------------------------------------------------------------------- */
/*  Landing page health                                                        */
/* -------------------------------------------------------------------------- */

export type PageHealth = "healthy" | "watch" | "at-risk";

export interface PageHealthRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  /** Signed fractional change in clicks. */
  trend: number;
  /** Signed fractional change in impressions — visibility, not traffic. */
  growth: number;
  health: PageHealth;
  /** Plain-language reason for the status. */
  note: string;
}

/** Click loss that counts as a decline rather than ordinary week-to-week noise. */
const DECLINE = 0.2;

/**
 * Per-page health.
 *
 * `trend` and `growth` are kept separate because they answer different
 * questions and routinely disagree. Clicks falling while impressions rise means
 * the page is being shown more and chosen less — a snippet problem. Both
 * falling means it is losing ground in the results. Collapsing them into one
 * "trend" column would hide exactly the case worth acting on.
 */
export function pageHealth(pages: PageRow[]): PageHealthRow[] {
  return pages
    .map((page) => {
      const growth =
        page.prevImpressions === 0
          ? page.impressions > 0
            ? 1
            : 0
          : (page.impressions - page.prevImpressions) / page.prevImpressions;

      let health: PageHealth = "healthy";
      let note = "Stable or growing.";

      // Percentages on tiny numbers are theatre: two clicks falling to one is
      // "-50%", and without this floor a site with four total clicks reports
      // pages "at risk". Nothing below the floor gets a warning status.
      const volume = Math.max(page.impressions, page.prevImpressions);
      if (volume < MIN_IMPRESSIONS) {
        return {
          page: page.page,
          clicks: page.clicks,
          impressions: page.impressions,
          ctr: page.ctr,
          position: page.position,
          trend: page.trend,
          growth,
          health: "healthy" as PageHealth,
          note: "Too little search volume to assess.",
        };
      }

      if (page.trend <= -DECLINE && growth <= -DECLINE) {
        health = "at-risk";
        note = "Clicks and impressions both falling — losing visibility.";
      } else if (page.trend <= -DECLINE && growth > 0) {
        health = "at-risk";
        note = "Shown more, clicked less — title and snippet are underperforming.";
      } else if (page.trend <= -DECLINE) {
        health = "watch";
        note = "Clicks falling.";
      } else if (growth <= -DECLINE) {
        health = "watch";
        note = "Impressions falling — clicks may follow.";
      } else if (page.clicks === 0 && page.impressions >= MIN_IMPRESSIONS) {
        health = "watch";
        note = "Visible but earning no clicks.";
      }

      return {
        page: page.page,
        clicks: page.clicks,
        impressions: page.impressions,
        ctr: page.ctr,
        position: page.position,
        trend: page.trend,
        growth,
        health,
        note,
      };
    })
    .sort(
      (a, b) =>
        // At-risk first, then by the size of what is at stake.
        rank(b.health) - rank(a.health) || b.impressions - a.impressions,
    );
}

function rank(health: PageHealth): number {
  return { "at-risk": 2, watch: 1, healthy: 0 }[health];
}
