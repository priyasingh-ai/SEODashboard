import { addDays, formatShortDate, parseISODate } from "@/lib/date-range";
import type { TimeseriesPoint } from "@/types";

/**
 * Traffic projection from the site's own daily click history.
 *
 * The word "prediction" is doing a lot of work in most SEO tools, and almost
 * none of it honestly. What is actually computable here is narrow: *if the
 * pattern of the last N days continues unchanged, this is roughly where clicks
 * land.* That is a projection of a trend, not a forecast of the future. It
 * cannot know about a algorithm update, a competitor launch, a seasonal peak
 * outside the window, or the page you are about to publish.
 *
 * So three rules govern this file:
 *
 *  1. **Refuse more often than you project.** Too little history, too much
 *     volatility, or a trend that reversed mid-window all produce a stated
 *     refusal with a reason, never a number. A confident line through noise is
 *     worse than an empty chart, because the reader cannot tell them apart.
 *
 *  2. **Never emit a point estimate without an interval.** The range is the
 *     honest part of the answer; the centre line is the guess.
 *
 *  3. **Be robust, not precise.** Theil–Sen for the slope and a MAD-based
 *     scale, because a single viral day or an outage should not set the
 *     direction of the next month.
 */

/* -------------------------------------------------------------------------- */
/*  Thresholds                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Below four weeks there is no way to separate weekly seasonality from trend.
 * Search traffic swings 2–3× between weekday and weekend for most sites; fit a
 * line to 10 days and you are mostly fitting the day of the week.
 */
const MIN_HISTORY_DAYS = 28;

/** A full weekly cycle. Needed to estimate day-of-week factors at all. */
const WEEK = 7;

/** Longest window we will project over, and the fraction of history it may span. */
const MAX_HORIZON_DAYS = 28;
const HORIZON_FRACTION = 0.5;

/**
 * Residual scale above this share of the mean means the series is noise.
 *
 * At 60% relative deviation the prediction interval is already wider than any
 * decision it could inform, so the projection is not wrong so much as useless.
 */
const MAX_RELATIVE_NOISE = 0.6;

/**
 * At least this share of days must have recorded a click.
 *
 * Every estimator in this file is median-based, and a median over a series that
 * is more than half zeros *is* zero. On a live property with 38 clicks in the
 * last month that produced a projection of exactly 0 clicks for the next 28
 * days, with a zero-width interval — the most confident possible statement,
 * about the one thing the data had already disproved. Robust statistics do not
 * degrade gracefully on sparse counts; they fail silently and decisively, so
 * the sparse case has to be caught before they run rather than sanity-checked
 * afterwards.
 */
const MIN_ACTIVE_SHARE = 0.5;

/** Half-window slopes must both exceed this share of the mean to count as a real reversal. */
const BREAK_SENSITIVITY = 0.15;

/** Minimum days remaining after a break before refitting on the tail is worthwhile. */
const MIN_REFIT_DAYS = 21;

/** ~95% interval under a normal residual assumption. */
const Z = 1.96;

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ForecastStatus =
  | "ok"
  | "insufficient-history"
  | "too-sparse"
  | "too-volatile"
  | "unstable-trend";

export interface ForecastPoint {
  date: string;
  /** Projected clicks. Never negative. */
  clicks: number;
  lower: number;
  upper: number;
}

export interface Forecast {
  status: ForecastStatus;
  /** Why no projection was produced. Present whenever `status !== "ok"`. */
  reason?: string;
  /** Days of data in the window. */
  historyDays: number;
  /**
   * Days actually fitted.
   *
   * Differs from `historyDays` when a trend reversal forced a refit on the
   * tail. The narrative must quote this one — saying "if the last 90 days
   * continue" about a line fitted to the last 45 misstates what was measured.
   */
  trendDays: number;
  horizonDays: number;
  points: ForecastPoint[];
  /** Projected clicks summed across the horizon. */
  total: number;
  lower: number;
  upper: number;
  /** Actual clicks over the equally-long window immediately before now. */
  baseline: number;
  /** Signed fractional change of `total` against `baseline`. */
  change: number;
  /**
   * Share of deseasonalised variance the trend line explains, 0–1.
   *
   * Low fit does not invalidate the projection — it is already reflected in the
   * interval — but it is the number that tells you how much the centre line is
   * worth relative to the band around it.
   */
  fit: number;
  /** Day-of-week multipliers, normalised to average 1. */
  weekly: { day: string; factor: number }[];
  /** Human-readable statements about what this projection assumes. */
  caveats: string[];
}

/* -------------------------------------------------------------------------- */
/*  Robust statistics                                                          */
/* -------------------------------------------------------------------------- */

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Median absolute deviation, scaled to be a consistent estimator of the
 * standard deviation for normal data. Unlike the standard deviation it does not
 * move when one day is ten times every other day.
 */
function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const centre = median(values);
  return 1.4826 * median(values.map((v) => Math.abs(v - centre)));
}

/**
 * Theil–Sen slope: the median of all pairwise slopes.
 *
 * O(n²), which for a year of daily data is ~66k pairs — trivial. Chosen over
 * least squares because it tolerates up to ~29% of the points being outliers
 * before it breaks down, and outages, tracking gaps and viral spikes are all
 * routine in this data.
 */
function theilSen(y: number[]): { slope: number; intercept: number } {
  const n = y.length;
  const slopes: number[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      slopes.push((y[j] - y[i]) / (j - i));
    }
  }
  const slope = median(slopes);
  const intercept = median(y.map((value, i) => value - slope * i));
  return { slope, intercept };
}

/* -------------------------------------------------------------------------- */
/*  Seasonality                                                                */
/* -------------------------------------------------------------------------- */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Multiplicative day-of-week factors, estimated by ratio-to-moving-average.
 *
 * A centred 7-day mean is by construction free of weekly seasonality, so each
 * day's ratio to it isolates the weekday effect from the trend. Taking the
 * median across weeks then discards the odd holiday or outage.
 *
 * Multiplicative rather than additive because search traffic scales: a site
 * doing 50 clicks a day and one doing 50,000 both lose roughly the same
 * *proportion* on a Sunday, not the same count.
 */
function weeklyFactors(series: number[], dows: number[]): number[] {
  const half = Math.floor(WEEK / 2);
  const ratios: number[][] = Array.from({ length: 7 }, () => []);

  for (let i = half; i < series.length - half; i += 1) {
    const window = series.slice(i - half, i + half + 1);
    const centre = mean(window);
    if (centre <= 0) continue;
    ratios[dows[i]].push(series[i] / centre);
  }

  // A weekday with no observations falls back to 1 — no adjustment is safer
  // than an adjustment estimated from nothing.
  const raw = ratios.map((r) => (r.length > 0 ? median(r) : 1));

  // Normalise so the factors redistribute traffic across the week rather than
  // scaling the whole forecast up or down.
  const avg = mean(raw);
  return avg > 0 ? raw.map((f) => f / avg) : raw.map(() => 1);
}

/* -------------------------------------------------------------------------- */
/*  Structural break                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Did the trend reverse partway through the window?
 *
 * Extrapolating a line fitted across a reversal is the single most misleading
 * thing this module could do: the two halves cancel, the slope comes out near
 * zero, and a site in freefall is reported as flat. Detected by fitting each
 * half separately and asking whether they disagree about the direction by a
 * margin larger than the noise.
 */
function findBreak(deseasonalised: number[]): number | undefined {
  const n = deseasonalised.length;
  const mid = Math.floor(n / 2);
  if (mid < WEEK * 2) return undefined;

  const first = theilSen(deseasonalised.slice(0, mid));
  const second = theilSen(deseasonalised.slice(mid));
  const level = mean(deseasonalised);
  if (level <= 0) return undefined;

  const materially = (slope: number) => Math.abs(slope * n) > BREAK_SENSITIVITY * level;

  return Math.sign(first.slope) !== Math.sign(second.slope) &&
    materially(first.slope) &&
    materially(second.slope)
    ? mid
    : undefined;
}

/* -------------------------------------------------------------------------- */
/*  Entry point                                                                */
/* -------------------------------------------------------------------------- */

function refuse(status: ForecastStatus, reason: string, historyDays: number): Forecast {
  return {
    status,
    reason,
    historyDays,
    trendDays: 0,
    horizonDays: 0,
    points: [],
    total: 0,
    lower: 0,
    upper: 0,
    baseline: 0,
    change: 0,
    fit: 0,
    weekly: [],
    caveats: [],
  };
}

export function forecastTraffic(timeseries: TimeseriesPoint[]): Forecast {
  const history = timeseries.filter((p) => Number.isFinite(p.clicks));
  const n = history.length;

  if (n < MIN_HISTORY_DAYS) {
    return refuse(
      "insufficient-history",
      `${n} day${n === 1 ? "" : "s"} of history — at least ${MIN_HISTORY_DAYS} are needed to separate the weekly cycle from the underlying trend. Widen the date range.`,
      n,
    );
  }

  const clicks = history.map((p) => p.clicks);
  const dows = history.map((p) => parseISODate(p.date).getUTCDay());
  const level = mean(clicks);

  if (level <= 0) {
    return refuse(
      "insufficient-history",
      "No clicks recorded across the window, so there is no trend to extend.",
      n,
    );
  }

  const active = clicks.filter((v) => v > 0).length;
  if (active / n < MIN_ACTIVE_SHARE) {
    return refuse(
      "too-sparse",
      `Only ${active} of ${n} days recorded a click. At that density the daily series is mostly zeros, and every method here would fit the zeros rather than the traffic. Total clicks over the window are still accurate — it is the day-shaped projection that is not available.`,
      n,
    );
  }

  const factors = weeklyFactors(clicks, dows);
  const deseasonalised = clicks.map((value, i) => value / (factors[dows[i]] || 1));

  // A reversal mid-window invalidates a single line. Refit on the tail when
  // enough of it remains; otherwise say so and stop.
  const breakAt = findBreak(deseasonalised);
  const caveats: string[] = [];
  let start = 0;

  if (breakAt !== undefined) {
    if (n - breakAt >= MIN_REFIT_DAYS) {
      start = breakAt;
      caveats.push(
        `The trend reversed direction around ${formatShortDate(history[breakAt].date)}. Only the ${n - breakAt} days since then feed this projection — the earlier period would pull it the wrong way.`,
      );
    } else {
      return refuse(
        "unstable-trend",
        `The trend reversed around ${formatShortDate(history[breakAt].date)} and only ${n - breakAt} days have passed since. Extending either half would misrepresent the other. Re-check once there are ${MIN_REFIT_DAYS} days past the turn.`,
        n,
      );
    }
  }

  const fitted = deseasonalised.slice(start);
  const m = fitted.length;

  const { slope, intercept } = theilSen(fitted);
  const residuals = fitted.map((value, i) => value - (intercept + slope * i));
  const fittedLevel = mean(fitted);

  // MAD reads zero whenever more than half the residuals are identical, which
  // on low-volume count data means a zero-width interval — certainty asserted
  // from a degenerate estimate. Fall back to the standard deviation, which
  // cannot collapse the same way, and only then to a floor of one click.
  const robustScale = mad(residuals);
  const sigma =
    robustScale > 0
      ? robustScale
      : Math.max(1, Math.sqrt(mean(residuals.map((r) => r * r))));

  if (fittedLevel > 0 && sigma / fittedLevel > MAX_RELATIVE_NOISE) {
    return refuse(
      "too-volatile",
      `Day-to-day clicks vary by about ${Math.round((sigma / fittedLevel) * 100)}% around the trend, which is wider than any projection would be useful at. The traffic is real; it is just not following a line yet.`,
      n,
    );
  }

  const horizonDays = Math.max(
    WEEK,
    Math.min(MAX_HORIZON_DAYS, Math.floor(m * HORIZON_FRACTION)),
  );

  // Ordinary-least-squares prediction-interval geometry, applied to a robust
  // slope. The band widens with distance from the centre of the fitted window,
  // which is the property that matters: day 28 must not look as certain as
  // day 1.
  const xBar = (m - 1) / 2;
  const sxx = fitted.reduce((sum, _, i) => sum + (i - xBar) ** 2, 0) || 1;

  const lastDate = history[n - 1].date;
  const points: ForecastPoint[] = [];

  for (let j = 1; j <= horizonDays; j += 1) {
    const date = addDays(lastDate, j);
    const x = m - 1 + j;
    const factor = factors[parseISODate(date).getUTCDay()] || 1;

    const centre = (intercept + slope * x) * factor;
    const se = sigma * Math.sqrt(1 + 1 / m + (x - xBar) ** 2 / sxx) * factor;

    points.push({
      date,
      // Clicks cannot be negative. A trend steep enough to project below zero
      // is telling you the site is heading to nothing, not that it will owe
      // Google traffic.
      clicks: Math.max(0, Math.round(centre)),
      lower: Math.max(0, Math.round(centre - Z * se)),
      upper: Math.max(0, Math.round(centre + Z * se)),
    });
  }

  const total = points.reduce((s, p) => s + p.clicks, 0);
  const baseline = clicks.slice(-horizonDays).reduce((s, v) => s + v, 0);

  const residualVar = mean(residuals.map((r) => r * r));
  const totalVar = mean(fitted.map((v) => (v - fittedLevel) ** 2));
  const fit = totalVar > 0 ? Math.max(0, Math.min(1, 1 - residualVar / totalVar)) : 0;

  caveats.push(
    `Extends the last ${m} days forward assuming nothing changes — no algorithm update, no new competitor, no content you publish next week. Any of those invalidates it.`,
    `The shaded band is a 95% range under the assumption that clicks stay as variable as they have been. It widens with distance because later days are less knowable, not because traffic gets noisier.`,
  );

  if (fit < 0.3) {
    caveats.push(
      `The trend line explains only ${Math.round(fit * 100)}% of the day-to-day variation, so treat the band as the answer and the centre line as the midpoint of it.`,
    );
  }

  return {
    status: "ok",
    historyDays: n,
    trendDays: m,
    horizonDays,
    points,
    total,
    lower: points.reduce((s, p) => s + p.lower, 0),
    upper: points.reduce((s, p) => s + p.upper, 0),
    baseline,
    change: baseline > 0 ? (total - baseline) / baseline : 0,
    fit,
    weekly: factors.map((factor, i) => ({ day: DAY_NAMES[i], factor })),
    caveats,
  };
}
