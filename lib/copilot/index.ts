import { buildActionReport } from "@/lib/actions";
import { formatCompact } from "@/lib/format";
import type { SiteReportData } from "@/services/types";
import type { AnalyticsInsights, KeywordMovement } from "@/types";
import { buildHighlights } from "./findings";
import { forecastTraffic } from "./forecast";
import { buildExecutiveSummary } from "./narrate";
import { scheduleTasks } from "./tasks";
import type { Confidence, CopilotBrief, CoverageNote } from "./types";

export * from "./types";
export { forecastTraffic } from "./forecast";

/**
 * The AI SEO Copilot.
 *
 * Composition, not measurement. Every figure it prints came from a module the
 * dashboard already renders elsewhere — the Action Center's rules engine, the
 * analytics narrative, keyword movement, the site metrics — and the Copilot's
 * contribution is deciding what matters, when to do it, and how to say it.
 *
 * That is the design that makes "never hallucinate" a property of the code
 * rather than a hope about a prompt. There is no generative step anywhere in
 * this pipeline. A statement the Copilot cannot trace to a number in its own
 * input is not merely discouraged; it has no way to exist.
 *
 * Runs entirely client-side on data already in the page's cache, so opening the
 * Copilot costs one memo and no Google quota. That is also why it reads only
 * the always-loaded endpoints: the technical, content, GEO and competitor
 * modules crawl live servers on demand, and quietly firing four crawls because
 * someone opened a summary page would be a hostile thing to do to both the
 * user's quota and other people's websites. What that leaves out is stated in
 * `coverage` rather than left to be inferred from silence.
 */

/** Below this the window cannot support a brief. Matches the Action Center. */
const MIN_IMPRESSIONS = 200;

/** Comfortable volume for rate-based statements to be stable. */
const CONFIDENT_IMPRESSIONS = 5_000;

/** How many wins and problems reach the brief. */
const HIGHLIGHT_LIMIT = 5;

export interface CopilotInput {
  report: SiteReportData;
  insights?: AnalyticsInsights;
  movement?: KeywordMovement;
}

/**
 * How much weight the brief deserves, driven by data volume and how well the
 * traffic followed a trend — never by how many findings turned up.
 *
 * A site with 200 impressions can easily generate a dozen findings, and none of
 * them mean anything. Confidence has to track the input, not the output, or it
 * reports its own eagerness back as certainty.
 */
function assessConfidence(
  impressions: number,
  forecastInformative: boolean,
  hasAnalytics: boolean,
): Confidence {
  if (impressions < MIN_IMPRESSIONS) return "low";
  if (impressions >= CONFIDENT_IMPRESSIONS && forecastInformative && hasAnalytics) return "high";
  if (impressions >= CONFIDENT_IMPRESSIONS || (forecastInformative && hasAnalytics)) return "medium";
  return "low";
}

/**
 * A forecast that was *produced* is not the same as a forecast that *says
 * something*.
 *
 * The volatility gate in `forecastTraffic` only refuses the extreme cases; a
 * series can clear it and still come back with an interval spanning a ninefold
 * range, which happened on a live property here — 22 to 198 clicks against a
 * baseline of 116, off a trend line explaining 5% of daily variation. Counting
 * that toward confidence reported "high confidence" over a projection that had
 * ruled nothing out. Two independent ways of being uninformative, both checked.
 */
function isForecastInformative(forecast: { status: string; upper: number; lower: number; baseline: number; fit: number }): boolean {
  if (forecast.status !== "ok") return false;
  if (forecast.upper - forecast.lower > forecast.baseline) return false;
  return forecast.fit >= 0.2;
}

function buildCoverage(input: CopilotInput): CoverageNote[] {
  const { report, insights, movement } = input;

  return [
    {
      label: "Search Console",
      status: "included",
      detail: `${formatCompact(report.queries.length)} queries and ${formatCompact(report.pages.length)} pages over the selected window, with the preceding window for comparison.`,
    },
    {
      label: "Google Analytics",
      status: insights ? "included" : "not-run",
      detail: insights
        ? "Engagement, channels, conversions and landing-page behaviour for the same window."
        : "Not loaded yet. Open Google Analytics once and the brief will fold engagement and conversion findings in.",
    },
    {
      label: "Keyword movement",
      status: movement ? "included" : "not-run",
      detail: movement
        ? movement.truncated
          ? "Loaded, but the API returned a capped row set — so improved and dropped keywords are used, while new and lost are withheld. Past the cap, a keyword's absence proves nothing."
          : "Improved, dropped, new and lost keywords against the preceding window."
        : "Not loaded yet. Open Search Console once and movement findings will appear here.",
    },
    {
      label: "Technical SEO, Content Health, GEO, Competitors",
      status: "not-run",
      detail:
        "Deliberately excluded. Each crawls live servers on demand and takes up to two minutes, so none run just because this page opened. Their findings stay on their own pages — this brief says nothing about crawl errors, schema coverage or AI visibility, and its silence on them is not a clean bill of health.",
    },
  ];
}

export function buildBrief(input: CopilotInput): CopilotBrief {
  const { report, insights, movement } = input;
  const { site, metrics, timeseries, pages } = report;

  const totalImpressions = pages.reduce((sum, p) => sum + p.impressions, 0);
  const forecast = forecastTraffic(timeseries);
  const coverage = buildCoverage(input);

  if (totalImpressions < MIN_IMPRESSIONS) {
    return {
      site,
      range: { from: timeseries[0]?.date ?? "", to: timeseries[timeseries.length - 1]?.date ?? "" },
      executiveSummary: [
        `This window holds ${formatCompact(totalImpressions)} impressions, which is not enough to say anything responsible about it. Rates computed on numbers this small swing wildly between windows, and a confident to-do list built on them would be noise presented as analysis. Widen the date range, or come back once the property has more history.`,
      ],
      wins: [],
      problems: [],
      opportunities: [],
      tasks: { today: [], week: [], month: [] },
      forecast,
      history: timeseries,
      coverage,
      confidence: "low",
      insufficientData: true,
      estimatedClicks: 0,
    };
  }

  // The Action Center's engine is the single source of ranked upside. Running
  // it again here rather than duplicating its rules is what guarantees a
  // Copilot task can never disagree with the card it came from.
  const actionReport = buildActionReport(report);
  const findingInput = { metrics, pages, movement, insights };

  const wins = buildHighlights(findingInput, true, HIGHLIGHT_LIMIT);
  const problems = buildHighlights(findingInput, false, HIGHLIGHT_LIMIT);
  const tasks = scheduleTasks(actionReport.actions, insights);

  const estimatedClicks =
    tasks.today.reduce((s, t) => s + (t.estimatedClicks ?? 0), 0) +
    tasks.week.reduce((s, t) => s + (t.estimatedClicks ?? 0), 0) +
    tasks.month.reduce((s, t) => s + (t.estimatedClicks ?? 0), 0);

  const range = {
    from: timeseries[0]?.date ?? "",
    to: timeseries[timeseries.length - 1]?.date ?? "",
  };

  return {
    site,
    range,
    executiveSummary: buildExecutiveSummary({
      metrics,
      range,
      wins,
      problems,
      forecast,
      tasks,
      estimatedClicks,
    }),
    wins,
    problems,
    // Top opportunities are the Action Center's own ranking, untouched.
    opportunities: actionReport.actions.filter((a) => !a.isRegression).slice(0, 6),
    tasks,
    forecast,
    history: timeseries,
    coverage,
    confidence: assessConfidence(totalImpressions, isForecastInformative(forecast), Boolean(insights)),
    insufficientData: false,
    estimatedClicks,
  };
}
