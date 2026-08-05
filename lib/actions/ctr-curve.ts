/**
 * Expected click-through rate as a function of search position.
 *
 * Every "your CTR is too low" claim depends on knowing what CTR *should* be at
 * a given rank, and that number varies enormously by site. A branded query at
 * rank 1 can pull 60%; an informational one at the same rank pulls 18%. Judging
 * every site against one hardcoded industry curve produces confident nonsense —
 * it would flag healthy informational pages and excuse weak branded ones.
 *
 * So the curve is fitted per site, per window, from the site's own rows, and
 * shrunk toward a published baseline in proportion to how little evidence each
 * position bucket actually has.
 */

/**
 * Fallback CTR by position, index 0 = position 1.
 *
 * Approximates the widely-published organic CTR studies (AWR / Sistrix shape:
 * a steep head, a long flat tail). Only ever used with weight — a bucket with
 * real observations moves away from it immediately.
 */
const BASELINE: readonly number[] = [
  0.275, 0.152, 0.1, 0.071, 0.053, 0.041, 0.033, 0.028, 0.024, 0.021,
  0.019, 0.017, 0.016, 0.015, 0.014, 0.013, 0.012, 0.011, 0.0105, 0.01,
];

/** Positions past this are treated as a flat floor — nobody scrolls there. */
const MAX_POSITION = BASELINE.length;

/**
 * Shrinkage strength, in "pseudo-observations" of the baseline.
 *
 * A bucket with 3 real rows sits halfway between observed and baseline; with 30
 * it is essentially all observed. Prevents one freak row from defining the
 * curve for a whole position bucket.
 */
const PRIOR_WEIGHT = 3;

/** Rows below this are too noisy to inform the fit (and are often anonymised). */
const MIN_IMPRESSIONS_TO_FIT = 25;

export interface CtrCurve {
  /** Expected CTR at a (possibly fractional) position. */
  at(position: number): number;
  /** How many rows informed the fit. Low values mean "mostly baseline". */
  readonly sampleSize: number;
}

interface Observation {
  position: number;
  ctr: number;
  impressions: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Fit a CTR curve to a site's rows.
 *
 * Median rather than mean per bucket: CTR distributions are heavily right-
 * skewed by a handful of branded terms, and a mean lets those drag the expected
 * value up for every other query at that rank.
 */
export function fitCtrCurve(rows: readonly Observation[]): CtrCurve {
  const usable = rows.filter(
    (r) =>
      r.impressions >= MIN_IMPRESSIONS_TO_FIT &&
      r.position >= 1 &&
      Number.isFinite(r.position) &&
      Number.isFinite(r.ctr),
  );

  // Bucket by whole position: index 0 = position 1.
  const buckets: number[][] = Array.from({ length: MAX_POSITION }, () => []);
  for (const row of usable) {
    const index = Math.min(MAX_POSITION, Math.round(row.position)) - 1;
    if (index >= 0) buckets[index].push(row.ctr);
  }

  const fitted = buckets.map((observations, i) => {
    const prior = BASELINE[i];
    if (observations.length === 0) return prior;
    const observed = median(observations);
    // Weighted blend: n real observations vs PRIOR_WEIGHT pseudo-observations.
    return (
      (observations.length * observed + PRIOR_WEIGHT * prior) /
      (observations.length + PRIOR_WEIGHT)
    );
  });

  // Enforce monotonic non-increase. Without this a sparse bucket can fit higher
  // than the rank above it, and "improve position" would compute a negative
  // gain — the model would recommend moving a page *down*.
  for (let i = 1; i < fitted.length; i++) {
    fitted[i] = Math.min(fitted[i], fitted[i - 1]);
  }

  return {
    sampleSize: usable.length,
    at(position: number): number {
      if (!Number.isFinite(position) || position < 1) return fitted[0];
      if (position >= MAX_POSITION) return fitted[MAX_POSITION - 1];

      // Linear interpolation between whole ranks: positions are averages, so
      // 7.4 is a real and meaningful value, not a rounding artefact.
      const lower = Math.floor(position);
      const weight = position - lower;
      return fitted[lower - 1] * (1 - weight) + fitted[lower] * weight;
    },
  };
}
