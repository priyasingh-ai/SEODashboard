import type { KeywordMovement, KeywordMovementRow, MovementKind } from "@/types";

/**
 * Classifying keyword movement between two windows.
 *
 * Shared by both providers so mock and Google cannot disagree about what counts
 * as "improved" or how a disappearance is proven. Pure and row-shape agnostic —
 * each provider adapts its own rows to `MovementInputRow` first.
 *
 * The hard part here is not improved-vs-dropped, which is arithmetic. It is
 * **new** and **lost**, both of which are claims about absence — and absence is
 * only meaningful if the other window was complete. See `absenceIsProvable`.
 */

export interface MovementInputRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Rank change, in positions, before a move is worth reporting. */
const MIN_POSITION_MOVE = 1;

/**
 * Impression floor.
 *
 * Deliberately low, because the day-over-day window slices volume to roughly a
 * twenty-eighth of the monthly one and a stricter floor would empty that view
 * entirely. The consequence is that the daily view is the noisiest of the three,
 * which the UI says out loud rather than leaving the reader to discover.
 */
const MIN_IMPRESSIONS = 10;

/** Rows kept per bucket. Counts stay uncapped so the headline stays honest. */
const MAX_ROWS_PER_KIND = 50;

/**
 * Build a test for whether a row's absence from `other` is real.
 *
 * Search Console returns at most `rowLimit` rows, ordered by clicks. If `other`
 * came back full, its tail was cut off and absence proves nothing — the row may
 * have been there the whole time, just below the line. Reporting that as a
 * discovery (or a disappearance) would churn most of a large site's long tail
 * every single period.
 *
 * When `other` was truncated we can still be certain about rows that outrank
 * the cut: had they been present with more clicks than the weakest row that did
 * come back, they would necessarily have been included.
 *
 * The same test serves both directions — pass the previous window to prove
 * "new", the current window to prove "lost".
 */
export function absenceIsProvable<T extends { clicks: number }>(
  other: readonly T[],
  rowLimit: number,
): (row: T) => boolean {
  if (other.length < rowLimit) return () => true;

  const cutoff = other.reduce((min, r) => Math.min(min, r.clicks), Infinity);
  return (row) => row.clicks > cutoff;
}

function row(
  kind: MovementKind,
  keyword: string,
  current: MovementInputRow | undefined,
  previous: MovementInputRow | undefined,
): KeywordMovementRow {
  const position = current?.position ?? 0;
  const prevPosition = previous?.position ?? 0;

  return {
    keyword,
    kind,
    clicks: current?.clicks ?? 0,
    prevClicks: previous?.clicks ?? 0,
    impressions: current?.impressions ?? 0,
    prevImpressions: previous?.impressions ?? 0,
    ctr: current?.ctr ?? 0,
    position,
    prevPosition,
    // Only meaningful when the keyword ranked in both windows.
    positionDelta: current && previous ? Number((position - prevPosition).toFixed(1)) : 0,
    clickDelta: (current?.clicks ?? 0) - (previous?.clicks ?? 0),
  };
}

export function classifyMovement(
  now: readonly MovementInputRow[],
  prev: readonly MovementInputRow[],
  rowLimit: number,
): Pick<KeywordMovement, "rows" | "counts" | "truncated"> {
  const nowByKey = new Map(now.map((r) => [r.key, r]));
  const prevByKey = new Map(prev.map((r) => [r.key, r]));

  const isNew = absenceIsProvable(prev, rowLimit);
  const isLost = absenceIsProvable(now, rowLimit);

  const buckets: Record<MovementKind, KeywordMovementRow[]> = {
    improved: [],
    dropped: [],
    new: [],
    lost: [],
  };

  for (const current of now) {
    const before = prevByKey.get(current.key);

    if (!before) {
      if (current.impressions >= MIN_IMPRESSIONS && isNew(current)) {
        buckets.new.push(row("new", current.key, current, undefined));
      }
      continue;
    }

    // Present in both: judge on volume from either window, so a keyword that is
    // fading out still qualifies on the strength of what it used to draw.
    if (Math.max(current.impressions, before.impressions) < MIN_IMPRESSIONS) continue;

    const delta = current.position - before.position;
    if (delta <= -MIN_POSITION_MOVE) {
      buckets.improved.push(row("improved", current.key, current, before));
    } else if (delta >= MIN_POSITION_MOVE) {
      buckets.dropped.push(row("dropped", current.key, current, before));
    }
  }

  for (const before of prev) {
    if (nowByKey.has(before.key)) continue;
    if (before.impressions < MIN_IMPRESSIONS) continue;
    if (!isLost(before)) continue;
    buckets.lost.push(row("lost", before.key, undefined, before));
  }

  // Clicks first — the point is impact, not the size of the rank number.
  const byImpact = (a: KeywordMovementRow, b: KeywordMovementRow) =>
    Math.abs(b.clickDelta) - Math.abs(a.clickDelta) ||
    Math.abs(b.positionDelta) - Math.abs(a.positionDelta) ||
    b.impressions - a.impressions;

  buckets.improved.sort(byImpact);
  buckets.dropped.sort(byImpact);
  buckets.new.sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);
  buckets.lost.sort((a, b) => b.prevClicks - a.prevClicks || b.prevImpressions - a.prevImpressions);

  const counts: Record<MovementKind, number> = {
    improved: buckets.improved.length,
    dropped: buckets.dropped.length,
    new: buckets.new.length,
    lost: buckets.lost.length,
  };

  return {
    counts,
    truncated: now.length >= rowLimit || prev.length >= rowLimit,
    rows: [
      ...buckets.improved.slice(0, MAX_ROWS_PER_KIND),
      ...buckets.dropped.slice(0, MAX_ROWS_PER_KIND),
      ...buckets.new.slice(0, MAX_ROWS_PER_KIND),
      ...buckets.lost.slice(0, MAX_ROWS_PER_KIND),
    ],
  };
}
