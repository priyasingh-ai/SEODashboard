import type {
  AcquisitionRow,
  AnalyticsInsights,
  AudienceSplitRow,
  BreakdownSlice,
  ConversionEventRow,
  ConversionSummary,
  DateRange,
  DropOffRow,
  EngagementSnapshot,
  JourneyStage,
  Metrics,
  MetricValue,
  PagePerformanceRow,
  PageRow,
  PreviousRowMetrics,
  QueryRow,
  SearchBreakdownRow,
  SearchBreakdowns,
  TimeseriesPoint,
} from "@/types";
import { addDays, daysBetween, eachDay, parseISODate, reportingAnchor } from "@/lib/date-range";
import { countryName, deviceName } from "@/lib/countries";
import type { MovementInputRow } from "../movement";
import type { TrafficProfile } from "./profiles";

/* -------------------------------------------------------------------------- */
/*  Deterministic randomness                                                   */
/* -------------------------------------------------------------------------- */

/** mulberry32 — small, fast, and stable across server and client. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string into a seed so keyword/page rows are stable per site. */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Days since the epoch — used as the x-axis of the trend model. */
function dayIndex(iso: string): number {
  return Math.floor(parseISODate(iso).getTime() / 86_400_000);
}

/** The single fixed origin of the trend model. See `dailyRow`. */
const ANCHOR_DAY = dayIndex(reportingAnchor());

/**
 * Compound drift, bounded.
 *
 * Naive `(1 + rate)^age` is exponential, which is fine across 7 or 28 days and
 * absurd across 365: a +0.78%/day site works out to 6% of today's traffic a year
 * ago and 0.3% the year before, so a 12-month view is a hockey stick and its
 * previous-period delta reads "+1600%".
 *
 * Real properties saturate — they grow into a ceiling, not to infinity. Applying
 * `tanh` in log space keeps the near-linear behaviour over short windows (where
 * the drift rate should be read literally) while asymptotically capping the
 * total swing at `e^±maxLog` over any horizon.
 */
function saturatingDrift(rate: number, age: number, maxLog = 0.7): number {
  if (rate === 0) return 1;
  const raw = rate * age;
  return Math.exp(Math.tanh(raw / maxLog) * maxLog);
}

/* -------------------------------------------------------------------------- */
/*  Daily model                                                                */
/* -------------------------------------------------------------------------- */

interface DailyRow {
  date: string;
  clicks: number;
  impressions: number;
  position: number;
  users: number;
  newUsers: number;
  sessions: number;
  engagedSessions: number;
  views: number;
  engagementSeconds: number;
}

/**
 * One day of traffic for a site.
 *
 * The model is: baseline × compound drift × weekly seasonality × seeded noise,
 * with a couple of annual-scale waves so 12-month views don't look like a
 * straight line. It's keyed off the absolute day index, so the same calendar
 * day always produces the same numbers regardless of which range asked for it —
 * that's what makes "previous period" comparisons internally consistent.
 */
function dailyRow(profile: TrafficProfile, date: string): DailyRow {
  const d = dayIndex(date);
  // Age is measured from one fixed global anchor, never from the requested
  // window's end. Keying it to the window would make every range recompute the
  // trend as if its own last day were "today" — the previous period would land
  // on the same baseline as the current one, drift would cancel, and every
  // comparison delta would collapse into pure noise.
  const age = d - ANCHOR_DAY; // 0 at the anchor, negative going back in time
  const rand = rng(profile.seed ^ (d * 2654435761));

  // Compound drift, bounded so a 12-month lookback stays within ~0.5–2× today.
  const drift = saturatingDrift(profile.dailyDrift, age);

  // Weekly seasonality — desktop-heavy sites dip harder on weekends.
  const dow = parseISODate(date).getUTCDay();
  const weekend = dow === 0 || dow === 6;
  const weekendFactor = 1 - profile.deviceMix.desktop * 0.5;
  const seasonal = weekend ? weekendFactor : 1 + (1 - weekendFactor) * 0.32;

  // Two slow waves — a yearly cycle plus a ~6-week ripple. Both are kept small:
  // they exist to stop 12-month views looking like a ruler, and anything larger
  // starts competing with `dailyDrift` and muddying week-over-week growth.
  const annual = 1 + 0.08 * Math.sin((d / 365) * Math.PI * 2 + profile.seed);
  const ripple = 1 + 0.025 * Math.sin((d / 41) * Math.PI * 2 + profile.seed * 0.7);

  // Seeded noise, plus a rare spike so the series doesn't look synthetic.
  const noise = 1 + (rand() - 0.5) * 2 * profile.volatility;
  const spike = rand() > 0.994 ? 1 + rand() * 0.5 : 1;

  const clicks = Math.max(
    1,
    Math.round(profile.baseClicks * drift * seasonal * annual * ripple * noise * spike),
  );

  // Impressions derive from clicks and CTR; CTR itself wobbles a little.
  const ctr = Math.min(0.95, Math.max(0.002, profile.baseCtr * (1 + (rand() - 0.5) * 0.24)));
  const impressions = Math.round(clicks / ctr);

  // Position is the one inverted measure: a growing site climbs, so its rank
  // *falls*. Hence the negated rate — without it, a growing site would show a
  // better rank in the past than it has today. Rank saturates harder than
  // traffic does (you can't rank better than 1), so it gets a tighter bound.
  const position = Math.max(
    1,
    profile.basePosition * saturatingDrift(-profile.dailyDrift * 0.6, age, 0.4) +
      (rand() - 0.5) * 1.4,
  );

  const users = Math.max(1, Math.round(clicks * profile.usersPerClick * (1 + (rand() - 0.5) * 0.1)));
  const newUsers = Math.round(users * profile.newUserShare * (1 + (rand() - 0.5) * 0.06));
  const sessions = Math.round(users * profile.sessionsPerUser * (1 + (rand() - 0.5) * 0.08));
  const engagedSessions = Math.round(sessions * profile.engagedShare * (1 + (rand() - 0.5) * 0.07));
  const views = Math.round(sessions * profile.viewsPerSession * (1 + (rand() - 0.5) * 0.12));
  const engagementSeconds = profile.engagementSeconds * (1 + (rand() - 0.5) * 0.18);

  return {
    date,
    clicks,
    impressions,
    position,
    users,
    newUsers,
    sessions,
    engagedSessions,
    views,
    engagementSeconds,
  };
}

function daily(profile: TrafficProfile, range: DateRange): DailyRow[] {
  return eachDay(range).map((date) => dailyRow(profile, date));
}

/* -------------------------------------------------------------------------- */
/*  Aggregation                                                                */
/* -------------------------------------------------------------------------- */

/** Sums sum; rates and positions are weighted, never averaged naively. */
function rollup(rows: DailyRow[]) {
  const sum = (pick: (r: DailyRow) => number) => rows.reduce((t, r) => t + pick(r), 0);

  const clicks = sum((r) => r.clicks);
  const impressions = sum((r) => r.impressions);
  const sessions = sum((r) => r.sessions);

  return {
    clicks,
    impressions,
    // Portfolio CTR is total clicks / total impressions — NOT the mean of daily CTRs.
    ctr: impressions === 0 ? 0 : clicks / impressions,
    // Average position is weighted by impressions, the way Search Console does it.
    position:
      impressions === 0
        ? 0
        : sum((r) => r.position * r.impressions) / impressions,
    users: sum((r) => r.users),
    newUsers: sum((r) => r.newUsers),
    sessions,
    engagedSessions: sum((r) => r.engagedSessions),
    views: sum((r) => r.views),
    // Engagement time is per-session, so weight it by sessions.
    avgEngagementTime:
      sessions === 0 ? 0 : sum((r) => r.engagementSeconds * r.sessions) / sessions,
  };
}

type Rollup = ReturnType<typeof rollup>;

function change(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 1;
  return (current - previous) / previous;
}

/** Downsample a series to at most `n` points for sparklines. */
function sparkline(rows: DailyRow[], pick: (r: DailyRow) => number, n = 24): number[] {
  if (rows.length <= n) return rows.map(pick);
  const bucket = rows.length / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const slice = rows.slice(Math.floor(i * bucket), Math.floor((i + 1) * bucket));
    if (!slice.length) continue;
    out.push(slice.reduce((t, r) => t + pick(r), 0) / slice.length);
  }
  return out;
}

function metric(
  key: keyof Rollup,
  cur: Rollup,
  prev: Rollup,
  rows: DailyRow[],
  pick: (r: DailyRow) => number,
): MetricValue {
  return {
    current: cur[key],
    previous: prev[key],
    change: change(cur[key], prev[key]),
    spark: sparkline(rows, pick),
  };
}

export function buildMetrics(
  profile: TrafficProfile,
  range: DateRange,
  prev: DateRange,
): Metrics {
  const curRows = daily(profile, range);
  const prevRows = daily(profile, prev);
  const cur = rollup(curRows);
  const pre = rollup(prevRows);

  return {
    clicks: metric("clicks", cur, pre, curRows, (r) => r.clicks),
    impressions: metric("impressions", cur, pre, curRows, (r) => r.impressions),
    ctr: metric("ctr", cur, pre, curRows, (r) => r.clicks / r.impressions),
    position: metric("position", cur, pre, curRows, (r) => r.position),
    users: metric("users", cur, pre, curRows, (r) => r.users),
    newUsers: metric("newUsers", cur, pre, curRows, (r) => r.newUsers),
    sessions: metric("sessions", cur, pre, curRows, (r) => r.sessions),
    engagedSessions: metric("engagedSessions", cur, pre, curRows, (r) => r.engagedSessions),
    views: metric("views", cur, pre, curRows, (r) => r.views),
    avgEngagementTime: metric(
      "avgEngagementTime",
      cur,
      pre,
      curRows,
      (r) => r.engagementSeconds,
    ),
  };
}

/**
 * Week-over-week click growth — the portfolio's headline "is it growing" number.
 *
 * Always the last 7 days against the 7 before, independent of the selected
 * range: "weekly growth" has to mean the same thing on every card no matter
 * which window the filter bar is showing.
 *
 * Both weeks are the same length and start on the same weekday, so the weekend
 * dip cancels instead of showing up as trend.
 */
export function buildWeeklyGrowth(
  profile: TrafficProfile,
  anchor: string = reportingAnchor(),
): number {
  const thisWeek = rollup(daily(profile, { from: addDays(anchor, -6), to: anchor }));
  const lastWeek = rollup(daily(profile, { from: addDays(anchor, -13), to: addDays(anchor, -7) }));
  return change(thisWeek.clicks, lastWeek.clicks);
}

/* -------------------------------------------------------------------------- */
/*  Timeseries (with previous-period alignment + bucketing)                    */
/* -------------------------------------------------------------------------- */

/**
 * Long windows get bucketed so charts stay readable — 365 daily points is a
 * smear, 52 weekly points is a trend. Sums sum, rates and positions re-weight.
 */
function bucketSize(days: number): number {
  if (days > 180) return 7; // 12 months -> weekly
  return 1; // 7d / 28d / 3m stay daily
}

export function buildTimeseries(
  profile: TrafficProfile,
  range: DateRange,
  prev: DateRange,
): TimeseriesPoint[] {
  const curRows = daily(profile, range);
  const prevRows = daily(profile, prev);
  const size = bucketSize(curRows.length);

  const points: TimeseriesPoint[] = [];
  for (let i = 0; i < curRows.length; i += size) {
    const c = curRows.slice(i, i + size);
    // Align previous period by index, not by date, so the two windows overlay.
    const p = prevRows.slice(i, i + size);
    if (!c.length) continue;

    const cr = rollup(c);
    const pr = p.length ? rollup(p) : cr;

    points.push({
      date: c[0].date,
      clicks: Math.round(cr.clicks),
      impressions: Math.round(cr.impressions),
      ctr: cr.ctr,
      position: Number(cr.position.toFixed(1)),
      users: Math.round(cr.users),
      sessions: Math.round(cr.sessions),
      prevClicks: Math.round(pr.clicks),
      prevImpressions: Math.round(pr.impressions),
      prevUsers: Math.round(pr.users),
      prevSessions: Math.round(pr.sessions),
      prevCtr: pr.ctr,
      prevPosition: Number(pr.position.toFixed(1)),
    });
  }
  return points;
}

/* -------------------------------------------------------------------------- */
/*  Dimension tables                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Zipf-ish weights: the head term takes a large share and the tail decays.
 * Real query reports look like this; a uniform spread does not.
 */
function zipf(count: number, skew = 1.1): number[] {
  const raw = Array.from({ length: count }, (_, i) => 1 / Math.pow(i + 1, skew));
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => v / total);
}

/**
 * Synthesise the previous-window metrics for one query or page row.
 *
 * The live provider gets these from a real second Search Console call. Mock has
 * no such row, so it perturbs the current values — enough spread that the
 * Action Center's rules fire on a realistic mix rather than on a flat surface,
 * while staying deterministic for a given seed.
 *
 * Never emits `prevImpressions: 0`; the mock keyword and page sets are fixed
 * across both windows, so no row is ever genuinely new here.
 */
function previousRow(
  prevClicks: number,
  ctr: number,
  position: number,
  rand: () => number,
): PreviousRowMetrics {
  const prevCtr = Math.min(0.62, Math.max(0.001, ctr * (0.8 + rand() * 0.45)));
  return {
    prevClicks,
    prevImpressions: Math.max(prevClicks, Math.round(prevClicks / prevCtr)),
    prevCtr,
    prevPosition: Number(Math.max(1, position * (0.82 + rand() * 0.42)).toFixed(1)),
    // The mock keyword and page sets are fixed across both windows, so no row
    // here is ever genuinely new. Claiming otherwise would make the Action
    // Center behave differently against mock data than against Google.
    isNew: false,
  };
}

export function buildQueries(profile: TrafficProfile, range: DateRange, prev: DateRange): QueryRow[] {
  const cur = rollup(daily(profile, range));
  const pre = rollup(daily(profile, prev));
  const weights = zipf(profile.keywords.length);

  return profile.keywords
    .map((keyword, i) => {
      const rand = rng(hash(keyword) ^ profile.seed);
      const jitter = 0.75 + rand() * 0.5;
      const share = weights[i] * jitter;

      const clicks = Math.max(1, Math.round(cur.clicks * share));
      const prevClicks = Math.max(1, Math.round(pre.clicks * share * (0.8 + rand() * 0.45)));

      // Head terms are usually branded/high-intent: better CTR, better position.
      const headBoost = 1 + (1 - i / profile.keywords.length) * 1.4;
      const ctr = Math.min(0.62, profile.baseCtr * headBoost * (0.7 + rand() * 0.7));
      const impressions = Math.max(clicks, Math.round(clicks / ctr));
      const position = Math.max(
        1,
        profile.basePosition * (0.45 + (i / profile.keywords.length) * 1.5) + (rand() - 0.5) * 2.5,
      );

      const spark = Array.from({ length: 7 }, (_, k) => {
        const r = rng(hash(keyword) ^ (k * 7919));
        return Math.max(0, (clicks / 7) * (0.6 + r() * 0.8));
      });

      return {
        keyword,
        clicks,
        impressions,
        ctr: clicks / impressions,
        position: Number(position.toFixed(1)),
        trend: change(clicks, prevClicks),
        spark,
        // Drawn last on purpose: appending RNG calls rather than interleaving
        // them keeps every pre-existing mock value bit-identical.
        ...previousRow(prevClicks, ctr, position, rand),
      };
    })
    .sort((a, b) => b.clicks - a.clicks);
}

export function buildPages(profile: TrafficProfile, range: DateRange, prev: DateRange): PageRow[] {
  const cur = rollup(daily(profile, range));
  const pre = rollup(daily(profile, prev));
  const weights = zipf(profile.pages.length, 0.95);

  return profile.pages
    .map((page, i) => {
      const rand = rng(hash(page) ^ profile.seed);
      const jitter = 0.7 + rand() * 0.6;
      const share = weights[i] * jitter;

      const clicks = Math.max(1, Math.round(cur.clicks * share));
      const prevClicks = Math.max(1, Math.round(pre.clicks * share * (0.82 + rand() * 0.4)));
      const ctr = Math.min(0.5, profile.baseCtr * (0.65 + rand() * 1.1));
      const impressions = Math.max(clicks, Math.round(clicks / ctr));
      const position = Math.max(
        1,
        profile.basePosition * (0.55 + (i / profile.pages.length) * 1.3) + (rand() - 0.5) * 2,
      );

      const users = Math.max(1, Math.round(cur.users * share * (0.85 + rand() * 0.3)));
      const sessions = Math.max(users, Math.round(users * profile.sessionsPerUser));

      return {
        page,
        clicks,
        impressions,
        ctr: clicks / impressions,
        position: Number(position.toFixed(1)),
        users,
        sessions,
        avgEngagementTime: Math.round(profile.engagementSeconds * (0.6 + rand() * 0.9)),
        trend: change(clicks, prevClicks),
        ...previousRow(prevClicks, ctr, position, rand),
      };
    })
    .sort((a, b) => b.clicks - a.clicks);
}

/* -------------------------------------------------------------------------- */
/*  Analytics intelligence                                                     */
/* -------------------------------------------------------------------------- */

const CHANNEL_LABELS: Record<string, string> = {
  organic: "Organic Search",
  direct: "Direct",
  referral: "Referral",
  social: "Social",
};

/** Source/medium pairs, mapped onto the profile's channel mix. */
const SOURCE_LABELS: Record<string, string> = {
  organic: "google / organic",
  direct: "(direct) / (none)",
  referral: "partner.example / referral",
  social: "linkedin.com / social",
};

function engagementFor(profile: TrafficProfile, range: DateRange): EngagementSnapshot {
  const roll = rollup(daily(profile, range));
  const engagedSessions = Math.round(roll.sessions * profile.engagedShare);

  return {
    users: roll.users,
    newUsers: Math.round(roll.users * profile.newUserShare),
    sessions: roll.sessions,
    engagedSessions,
    views: Math.round(roll.sessions * profile.viewsPerSession),
    bounceRate: 1 - profile.engagedShare,
    engagementRate: profile.engagedShare,
    viewsPerSession: profile.viewsPerSession,
    sessionsPerUser: profile.sessionsPerUser,
    engagementDuration: Math.round(engagedSessions * profile.engagementSeconds),
  };
}

/**
 * Deep analytics fixtures.
 *
 * Unlike the live properties — none of which have key events configured — the
 * mock deliberately *does* report them. Fixture data exists to exercise the UI,
 * and a permanently-empty conversions panel in development would leave that
 * whole path untested until it first ran against a customer who had set them up.
 */
export function buildAnalyticsInsights(
  profile: TrafficProfile,
  range: DateRange,
  prev: DateRange,
): AnalyticsInsights {
  const engagement = engagementFor(profile, range);
  const previousEngagement = engagementFor(profile, prev);

  const acquisition = (labels: Record<string, string>, salt: number): AcquisitionRow[] => {
    const entries = Object.entries(profile.channelMix);
    const sum = entries.reduce((t, [, v]) => t + v, 0);

    return entries
      .map(([key, weight]) => {
        const rand = rng(hash(key) ^ profile.seed ^ salt);
        const share = weight / sum;
        const sessions = Math.round(engagement.sessions * share);
        const prevSessions = Math.round(previousEngagement.sessions * share * (0.85 + rand() * 0.32));
        const engagementRate = Math.min(0.95, profile.engagedShare * (0.8 + rand() * 0.45));

        return {
          label: labels[key] ?? key,
          sessions,
          users: Math.round(sessions / profile.sessionsPerUser),
          engagedSessions: Math.round(sessions * engagementRate),
          engagementRate,
          keyEvents: Math.round(sessions * 0.02 * (0.5 + rand())),
          prevSessions,
          trend: change(sessions, prevSessions),
          share,
        };
      })
      .sort((a, b) => b.sessions - a.sessions);
  };

  const channels = acquisition(CHANNEL_LABELS, 0xac1);
  const sources = acquisition(SOURCE_LABELS, 0xac2);

  const keyEvents = channels.reduce((t, c) => t + c.keyEvents, 0);
  const prevKeyEvents = Math.round(keyEvents * 0.88);

  const EVENTS = ["sign_up", "contact_form", "add_to_cart", "purchase"];
  const events: ConversionEventRow[] = EVENTS.map((eventName, i) => {
    const rand = rng(hash(eventName) ^ profile.seed);
    const count = Math.max(1, Math.round(keyEvents * (0.4 / (i + 1)) * (0.7 + rand() * 0.6)));
    const before = Math.max(1, Math.round(count * (0.75 + rand() * 0.5)));
    return {
      eventName,
      eventCount: Math.round(count * (2 + rand() * 3)),
      keyEvents: count,
      prevKeyEvents: before,
      trend: change(count, before),
    };
  }).sort((a, b) => b.keyEvents - a.keyEvents);

  const conversions: ConversionSummary = {
    keyEvents,
    prevKeyEvents,
    keyEventRate: engagement.sessions === 0 ? 0 : keyEvents / engagement.sessions,
    revenue: 0,
    events,
    notConfigured: false,
  };

  const weights = zipf(profile.pages.length, 0.95);
  const pages: PagePerformanceRow[] = profile.pages
    .map((page, i) => {
      const rand = rng(hash(page) ^ profile.seed ^ 0x9a3);
      const views = Math.max(1, Math.round(engagement.views * weights[i] * (0.7 + rand() * 0.6)));
      const engagementRate = Math.min(0.97, Math.max(0.05, profile.engagedShare * (0.55 + rand() * 0.9)));
      const avgEngagementTime = profile.engagementSeconds * (0.4 + rand() * 1.3);

      return {
        page,
        views,
        users: Math.max(1, Math.round(views / profile.viewsPerSession / profile.sessionsPerUser)),
        engagementRate,
        bounceRate: 1 - engagementRate,
        avgEngagementTime,
        // Same blend the live provider uses, kept in step by hand — see the note
        // on `pageScore` in the Google provider.
        score: Math.round(
          Math.max(0, Math.min(1,
            engagementRate * 0.45 + engagementRate * 0.3 + Math.min(1, avgEngagementTime / 120) * 0.25,
          )) * 100,
        ),
      };
    })
    .sort((a, b) => b.score - a.score || b.views - a.views);

  const dropOff: DropOffRow[] = profile.pages
    .map((page, i) => {
      const rand = rng(hash(page) ^ profile.seed ^ 0xd0f);
      const sessions = Math.max(1, Math.round(engagement.sessions * weights[i] * (0.7 + rand() * 0.6)));
      const bounceRate = Math.min(0.95, Math.max(0.05, (1 - profile.engagedShare) * (0.6 + rand() * 1.1)));

      return {
        page,
        sessions,
        bounceRate,
        engagementRate: 1 - bounceRate,
        avgSessionDuration: profile.engagementSeconds * (0.5 + rand()),
        lostSessions: Math.round(sessions * bounceRate),
      };
    })
    .sort((a, b) => b.lostSessions - a.lostSessions);

  const newUsers = engagement.newUsers;
  const returning = Math.max(0, engagement.users - newUsers);
  const audience: AudienceSplitRow[] = [
    { label: "New", users: newUsers, sessions: Math.round(newUsers * 1.1), engagementRate: profile.engagedShare * 0.9, share: engagement.users === 0 ? 0 : newUsers / engagement.users },
    { label: "Returning", users: returning, sessions: Math.round(returning * 1.6), engagementRate: Math.min(0.95, profile.engagedShare * 1.2), share: engagement.users === 0 ? 0 : returning / engagement.users },
  ].sort((a, b) => b.users - a.users);

  // Sessions first, not users — users are a different unit and would make the
  // funnel widen. See the note on `toJourney` in the Google provider.
  const stages = [
    {
      stage: "Sessions",
      value: engagement.sessions,
      description: `Visits from ${engagement.users.toLocaleString("en-US")} distinct users.`,
    },
    { stage: "Engaged sessions", value: engagement.engagedSessions, description: "Lasted over 10s, or had 2+ views, or triggered a key event." },
    { stage: "Key events", value: keyEvents, description: "Sessions that completed an action marked as a key event." },
  ];
  const first = stages[0].value;
  const journey: JourneyStage[] = stages.map((s, i) => ({
    ...s,
    share: first === 0 ? 0 : s.value / first,
    stepRate: i === 0 ? 1 : stages[i - 1].value === 0 ? 0 : s.value / stages[i - 1].value,
  }));

  return {
    engagement,
    previousEngagement,
    channels,
    sources,
    conversions,
    journey,
    pages,
    dropOff,
    audience,
  };
}

/* -------------------------------------------------------------------------- */
/*  Search Console intelligence                                                */
/* -------------------------------------------------------------------------- */

/**
 * Two windows of synthetic query rows, ready for `classifyMovement`.
 *
 * Returning raw rows rather than a finished movement report is deliberate: the
 * mock then goes through exactly the same classifier as the live provider, so
 * the thresholds, the sorting and the truncation reasoning cannot drift between
 * data sources.
 *
 * The profile keyword list is fixed across both windows, so nothing would ever
 * be new or lost on its own. A small deterministic slice is therefore withheld
 * from each window — otherwise two of the four movement buckets would render
 * permanently empty in development and never get exercised.
 */
export function buildMovementRows(
  profile: TrafficProfile,
  range: DateRange,
  prev: DateRange,
): { now: MovementInputRow[]; previous: MovementInputRow[] } {
  const cur = rollup(daily(profile, range));
  const pre = rollup(daily(profile, prev));
  const weights = zipf(profile.keywords.length);

  const now: MovementInputRow[] = [];
  const previous: MovementInputRow[] = [];

  // Salt the seed with the window length so day, week and month each produce a
  // different set of movers. Without it all three tabs render identical rows,
  // and the window selector looks broken in development.
  const windowSalt = daysBetween(range.from, range.to) * 0x9e37;

  profile.keywords.forEach((keyword, i) => {
    // Distinct seed salt so movement doesn't mirror the queries table exactly.
    const rand = rng(hash(keyword) ^ profile.seed ^ 0x51ed3 ^ windowSalt);
    const share = weights[i] * (0.75 + rand() * 0.5);

    const ctr = Math.min(0.6, Math.max(0.005, profile.baseCtr * (0.7 + rand() * 0.7)));
    const clicks = Math.max(0, Math.round(cur.clicks * share));
    const prevClicks = Math.max(0, Math.round(pre.clicks * share * (0.8 + rand() * 0.45)));

    const position = Math.max(
      1,
      profile.basePosition * (0.5 + (i / profile.keywords.length) * 1.5) + (rand() - 0.5) * 3,
    );
    const prevPosition = Math.max(1, position + (rand() - 0.5) * 6);

    // Withhold by index, and only among head terms.
    //
    // A random roll picks mostly tail keywords, whose Zipf share leaves them
    // below the classifier's impression floor — so they get filtered out and
    // the "lost" bucket renders permanently empty. Head terms are the only ones
    // carrying enough volume for a withheld row to actually surface.
    const withholdFromNow = i === 2 || i === 5; // becomes "lost"
    const withholdFromPrev = i === 3 || i === 7; // becomes "new"

    if (!withholdFromNow) {
      now.push({
        key: keyword,
        clicks,
        impressions: Math.max(clicks, Math.round(clicks / ctr)),
        ctr,
        position: Number(position.toFixed(1)),
      });
    }
    if (!withholdFromPrev) {
      previous.push({
        key: keyword,
        clicks: prevClicks,
        impressions: Math.max(prevClicks, Math.round(prevClicks / ctr)),
        ctr,
        position: Number(prevPosition.toFixed(1)),
      });
    }
  });

  return { now, previous };
}

/**
 * Country and device breakdowns, measured in clicks.
 *
 * Clicks rather than users or sessions: this stands in for Search Console, which
 * has no concept of either. Reusing the GA4-shaped `devices` numbers here would
 * put two different measurements behind one label.
 */
export function buildSearchBreakdowns(
  profile: TrafficProfile,
  range: DateRange,
  prev: DateRange,
): SearchBreakdowns {
  const cur = rollup(daily(profile, range));
  const pre = rollup(daily(profile, prev));

  const build = (
    mix: Record<string, number>,
    label: (key: string) => string,
    salt: number,
  ): SearchBreakdownRow[] => {
    const entries = Object.entries(mix);
    const sum = entries.reduce((t, [, v]) => t + v, 0);

    return entries
      .map(([key, weight]) => {
        const rand = rng(hash(key) ^ profile.seed ^ salt);
        const share = weight / sum;
        const clicks = Math.round(cur.clicks * share);
        const prevClicks = Math.round(pre.clicks * share * (0.85 + rand() * 0.3));
        const ctr = Math.min(0.6, Math.max(0.005, profile.baseCtr * (0.75 + rand() * 0.6)));

        return {
          key,
          label: label(key),
          clicks,
          impressions: Math.max(clicks, Math.round(clicks / ctr)),
          ctr,
          position: Number(
            Math.max(1, profile.basePosition * (0.8 + rand() * 0.6)).toFixed(1),
          ),
          share,
          prevClicks,
          trend: change(clicks, prevClicks),
        };
      })
      .sort((a, b) => b.clicks - a.clicks);
  };

  return {
    countries: build(profile.countryMix, countryName, 0x0c0),
    devices: build(
      // GSC reports devices uppercase; mirror that so `deviceName` is exercised.
      { MOBILE: profile.deviceMix.mobile, DESKTOP: profile.deviceMix.desktop, TABLET: profile.deviceMix.tablet },
      deviceName,
      0x0de,
    ),
  };
}

function slices(mix: Record<string, number>, total: number, labels: Record<string, string>): BreakdownSlice[] {
  const entries = Object.entries(mix);
  const sum = entries.reduce((t, [, v]) => t + v, 0);
  return entries
    .map(([key, v]) => ({
      label: labels[key] ?? key,
      value: Math.round(total * (v / sum)),
      share: v / sum,
    }))
    .sort((a, b) => b.value - a.value);
}

export function buildTrafficSources(profile: TrafficProfile, range: DateRange): BreakdownSlice[] {
  const cur = rollup(daily(profile, range));
  return slices(profile.channelMix, cur.sessions, {
    organic: "Organic Search",
    direct: "Direct",
    referral: "Referral",
    social: "Social",
  });
}

export function buildDevices(profile: TrafficProfile, range: DateRange): BreakdownSlice[] {
  const cur = rollup(daily(profile, range));
  return slices(profile.deviceMix, cur.users, {
    mobile: "Mobile",
    desktop: "Desktop",
    tablet: "Tablet",
  });
}

/* -------------------------------------------------------------------------- */
/*  Portfolio roll-up                                                          */
/* -------------------------------------------------------------------------- */

/** Combine per-site metrics into one portfolio total, re-weighting the rates. */
export function sumMetrics(all: Metrics[]): Metrics {
  const add = (key: keyof Metrics, field: "current" | "previous") =>
    all.reduce((t, m) => t + m[key][field], 0);

  const build = (key: keyof Metrics): MetricValue => {
    const current = add(key, "current");
    const previous = add(key, "previous");
    const len = Math.max(...all.map((m) => m[key].spark.length));
    const spark = Array.from({ length: len }, (_, i) =>
      all.reduce((t, m) => t + (m[key].spark[i] ?? 0), 0),
    );
    return { current, previous, change: change(current, previous), spark };
  };

  // Weighted rather than summed: a ratio of sums, not a sum of ratios.
  const weighted = (
    key: keyof Metrics,
    weightKey: keyof Metrics,
  ): MetricValue => {
    const ratio = (field: "current" | "previous") => {
      const w = add(weightKey, field);
      if (w === 0) return 0;
      return all.reduce((t, m) => t + m[key][field] * m[weightKey][field], 0) / w;
    };
    const current = ratio("current");
    const previous = ratio("previous");
    const len = Math.max(...all.map((m) => m[key].spark.length));
    const spark = Array.from({ length: len }, (_, i) => {
      const w = all.reduce((t, m) => t + (m[weightKey].spark[i] ?? 0), 0);
      if (w === 0) return 0;
      return (
        all.reduce((t, m) => t + (m[key].spark[i] ?? 0) * (m[weightKey].spark[i] ?? 0), 0) / w
      );
    });
    return { current, previous, change: change(current, previous), spark };
  };

  const clicks = build("clicks");
  const impressions = build("impressions");

  return {
    clicks,
    impressions,
    ctr: {
      current: impressions.current === 0 ? 0 : clicks.current / impressions.current,
      previous: impressions.previous === 0 ? 0 : clicks.previous / impressions.previous,
      change: change(
        impressions.current === 0 ? 0 : clicks.current / impressions.current,
        impressions.previous === 0 ? 0 : clicks.previous / impressions.previous,
      ),
      spark: clicks.spark.map((c, i) => (impressions.spark[i] ? c / impressions.spark[i] : 0)),
    },
    position: weighted("position", "impressions"),
    users: build("users"),
    newUsers: build("newUsers"),
    sessions: build("sessions"),
    engagedSessions: build("engagedSessions"),
    views: build("views"),
    avgEngagementTime: weighted("avgEngagementTime", "sessions"),
  };
}

export { rollup, change, daysBetween };
