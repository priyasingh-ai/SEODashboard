import { buildNarrative } from "@/lib/analytics-narrative";
import {
  formatCompact,
  formatDelta,
  formatNumber,
  formatPercent,
  formatPosition,
  truncatePath,
} from "@/lib/format";
import type {
  AnalyticsInsights,
  KeywordMovement,
  KeywordMovementRow,
  Metrics,
  PageRow,
} from "@/types";
import type { Highlight } from "./types";

/**
 * Wins and problems, selected from data the dashboard already computed.
 *
 * Two ranking pools, deliberately never merged into one sort:
 *
 *   - Search signals rank by **clicks gained or lost**.
 *   - Analytics signals keep the order `buildNarrative` produced, which is
 *     already a considered ordering over sessions and engagement.
 *
 * They are interleaved rather than sorted together because clicks and sessions
 * are different units with no honest conversion between them. Any single
 * ranking across both would require inventing an exchange rate, and whichever
 * one was picked would silently decide which half of the dashboard the reader
 * pays attention to.
 */

/** Relative change below this is noise. Matches the analytics narrative's floor. */
const MIN_CHANGE = 0.05;

/** Absolute floors, so a percentage is never computed on a handful of clicks. */
const MIN_SITE_CLICKS = 50;
const MIN_ROW_CLICKS = 5;

/** How many of each kind survive to the brief. */
const PER_POOL = 3;

function highlightId(prefix: string, subject: string): string {
  return `${prefix}:${subject}`;
}

/* -------------------------------------------------------------------------- */
/*  Search Console signals                                                     */
/* -------------------------------------------------------------------------- */

function siteLevel(metrics: Metrics, positive: boolean): Highlight[] {
  const clicks = metrics.clicks;
  const delta = clicks.current - clicks.previous;

  if (clicks.previous < MIN_SITE_CLICKS) return [];
  if (Math.abs(clicks.change) < MIN_CHANGE) return [];
  if (positive !== delta > 0) return [];

  const impressions = metrics.impressions;
  const position = metrics.position;

  return [
    {
      id: highlightId(positive ? "win" : "problem", "site-clicks"),
      title: `Clicks ${positive ? "rose" : "fell"} ${formatPercent(Math.abs(clicks.change), 0)} to ${formatCompact(clicks.current)}`,
      // Which of the two inputs to clicks moved. This is decomposition, not
      // causation: impressions × CTR is an identity, so attributing the change
      // to one of them is arithmetic rather than a guess about the world.
      detail:
        Math.abs(impressions.change) >= Math.abs(clicks.change) / 2
          ? `Impressions ${impressions.change > 0 ? "rose" : "fell"} ${formatPercent(Math.abs(impressions.change), 0)} over the same window, so most of this is reach rather than click-through.`
          : `Impressions moved only ${formatPercent(Math.abs(impressions.change), 0)}, so this is a change in click-through on roughly the same reach.`,
      magnitude: Math.abs(delta),
      facts: [
        { label: "Clicks", value: `${formatCompact(clicks.current)} (${formatDelta(clicks.change)})` },
        { label: "Impressions", value: `${formatCompact(impressions.current)} (${formatDelta(impressions.change)})` },
        { label: "Avg position", value: formatPosition(position.current) },
      ],
      source: "search-console",
    },
  ];
}

function fromMovement(movement: KeywordMovement | undefined, positive: boolean): Highlight[] {
  if (!movement) return [];

  const material = (row: KeywordMovementRow) =>
    Math.abs(row.clickDelta) >= MIN_ROW_CLICKS || row.clicks >= MIN_ROW_CLICKS;

  const kinds = positive ? ["improved", "new"] : ["dropped", "lost"];
  const rows = movement.rows
    .filter((r) => kinds.includes(r.kind) && material(r))
    // "new" and "lost" are only knowable when neither window hit the API row
    // cap. Past the cap, absence proves nothing — the keyword may simply have
    // fallen below the returned set.
    .filter((r) => !movement.truncated || (r.kind !== "new" && r.kind !== "lost"))
    .sort((a, b) => Math.abs(b.clickDelta) - Math.abs(a.clickDelta))
    .slice(0, PER_POOL);

  return rows.map((row) => {
    const moved = row.positionDelta !== 0;
    return {
      id: highlightId(positive ? "win" : "problem", `kw-${row.keyword}`),
      title:
        row.kind === "new"
          ? `"${row.keyword}" started ranking at position ${formatPosition(row.position)}`
          : row.kind === "lost"
            ? `"${row.keyword}" stopped ranking, taking ${formatNumber(row.prevClicks)} clicks with it`
            : `"${row.keyword}" ${positive ? "gained" : "lost"} ${formatNumber(Math.abs(row.clickDelta))} clicks`,
      detail: moved
        ? `Moved ${Math.abs(row.positionDelta).toFixed(1)} places ${row.positionDelta < 0 ? "toward the top" : "down"}, now at position ${formatPosition(row.position)} on ${formatCompact(row.impressions)} impressions.`
        : row.kind === "new"
          ? `Drawing ${formatCompact(row.impressions)} impressions already, with no history in the previous window.`
          : `Drew ${formatCompact(row.prevImpressions)} impressions in the previous window and none in this one.`,
      magnitude: Math.abs(row.clickDelta) || row.clicks,
      facts: [
        { label: "Clicks", value: `${formatNumber(row.clicks)} (was ${formatNumber(row.prevClicks)})` },
        { label: "Impressions", value: formatCompact(row.impressions) },
        ...(moved ? [{ label: "Position", value: `${formatPosition(row.prevPosition)} → ${formatPosition(row.position)}` }] : []),
      ],
      source: "keyword-movement",
    };
  });
}

function fromPages(pages: PageRow[], positive: boolean): Highlight[] {
  const rows = pages
    .filter((p) => p.prevClicks >= MIN_ROW_CLICKS && Math.abs(p.trend) >= MIN_CHANGE)
    .filter((p) => positive === p.trend > 0)
    .map((p) => ({ page: p, delta: p.clicks - p.prevClicks }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, PER_POOL);

  return rows.map(({ page, delta }) => ({
    id: highlightId(positive ? "win" : "problem", `page-${page.page}`),
    title: `${truncatePath(page.page)} ${positive ? "gained" : "lost"} ${formatNumber(Math.abs(delta))} clicks`,
    detail:
      Math.abs(page.impressions - page.prevImpressions) / Math.max(page.prevImpressions, 1) >= MIN_CHANGE
        ? `Impressions went from ${formatCompact(page.prevImpressions)} to ${formatCompact(page.impressions)}, so the page's reach changed, not just its click-through.`
        : `Impressions held near ${formatCompact(page.impressions)} while CTR moved from ${formatPercent(page.prevCtr)} to ${formatPercent(page.ctr)}.`,
    magnitude: Math.abs(delta),
    facts: [
      { label: "Clicks", value: `${formatNumber(page.clicks)} (${formatDelta(page.trend)})` },
      { label: "CTR", value: formatPercent(page.ctr) },
      { label: "Position", value: formatPosition(page.position) },
    ],
    source: "search-console",
  }));
}

/* -------------------------------------------------------------------------- */
/*  Analytics signals                                                          */
/* -------------------------------------------------------------------------- */

function fromAnalytics(insights: AnalyticsInsights | undefined, positive: boolean): Highlight[] {
  if (!insights) return [];

  return buildNarrative(insights)
    .filter((n) => n.tone === (positive ? "positive" : "negative"))
    .slice(0, PER_POOL)
    .map((n) => ({
      id: highlightId(positive ? "win" : "problem", n.id),
      title: n.headline,
      detail: n.detail,
      // Ranking within the analytics pool is `buildNarrative`'s own order,
      // preserved here. Nothing compares this to a click count.
      magnitude: 0,
      facts: n.evidence,
      source: "analytics" as const,
    }));
}

/* -------------------------------------------------------------------------- */

/**
 * Interleave the two pools so neither can crowd the other out.
 *
 * Round-robin rather than concatenation: a site with six search findings and
 * two analytics findings should still surface both analytics findings, because
 * the reason to look at engagement data is precisely that it says something
 * Search Console cannot.
 */
function interleave(search: Highlight[], analytics: Highlight[], limit: number): Highlight[] {
  const out: Highlight[] = [];
  for (let i = 0; out.length < limit && (i < search.length || i < analytics.length); i += 1) {
    if (i < search.length) out.push(search[i]);
    if (out.length < limit && i < analytics.length) out.push(analytics[i]);
  }
  return out;
}

export interface FindingInput {
  metrics: Metrics;
  pages: PageRow[];
  movement?: KeywordMovement;
  insights?: AnalyticsInsights;
}

export function buildHighlights(
  input: FindingInput,
  positive: boolean,
  limit = 5,
): Highlight[] {
  const search = [
    ...siteLevel(input.metrics, positive),
    ...fromMovement(input.movement, positive),
    ...fromPages(input.pages, positive),
  ].sort((a, b) => b.magnitude - a.magnitude);

  return interleave(search, fromAnalytics(input.insights, positive), limit);
}
