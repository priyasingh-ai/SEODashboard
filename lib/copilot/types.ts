import type { ActionItem, Impact, Priority, SubjectKind } from "@/lib/actions/types";
import type { DateRange, Site, TimeseriesPoint } from "@/types";
import type { Forecast } from "./forecast";

/**
 * The Copilot's vocabulary.
 *
 * The Copilot does not measure anything of its own. Every number it prints was
 * computed by a module that already existed and is already rendered somewhere
 * else in the dashboard — the Action Center's rules, the analytics narrative,
 * keyword movement, the site metrics. Its whole job is selection, ranking,
 * scheduling and phrasing.
 *
 * That constraint is what makes "never hallucinate" enforceable rather than
 * aspirational: a brief cannot contain a fact the dashboard would contradict,
 * because it has no way to produce one.
 */

export type { Forecast, ForecastPoint, ForecastStatus } from "./forecast";

/** Which existing module a statement came from. Shown so any claim is traceable. */
export type SignalSource = "search-console" | "analytics" | "keyword-movement";

export const SOURCE_LABEL: Record<SignalSource, string> = {
  "search-console": "Search Console",
  analytics: "Google Analytics",
  "keyword-movement": "Keyword movement",
};

/** One supporting number, already formatted. */
export interface Fact {
  label: string;
  value: string;
}

/** A win or a problem — the same shape, opposite sign. */
export interface Highlight {
  id: string;
  /** One sentence, containing the change itself. */
  title: string;
  /** What accounted for it. Never why it happened. */
  detail: string;
  /**
   * Ranking weight in clicks or sessions — never a percentage.
   *
   * Sorting highlights by percentage change is how a 300% rise on four clicks
   * ends up above a 12% fall on forty thousand.
   */
  magnitude: number;
  facts: Fact[];
  source: SignalSource;
}

/**
 * When a task is worth doing, derived from how long it takes and how urgent it
 * is — not chosen per-rule, so "Today" means the same thing everywhere.
 */
export type Horizon = "today" | "week" | "month";

/**
 * How much work the fix is.
 *
 * `quick` is one person, one sitting, no dependencies — a title rewrite, a meta
 * description, adding a link. `moderate` needs a content or dev change but
 * touches one page. `project` needs a decision, a template change, or a
 * campaign across many pages.
 */
export type Effort = "quick" | "moderate" | "project";

export const EFFORT_LABEL: Record<Effort, string> = {
  quick: "Quick",
  moderate: "Moderate",
  project: "Project",
};

export const HORIZON_LABEL: Record<Horizon, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
};

export const HORIZON_DESCRIPTION: Record<Horizon, string> = {
  today: "High-value fixes that take one sitting and need nobody's approval.",
  week: "Work that needs a content or code change on a specific page.",
  month: "Themes rather than tasks — patterns across enough pages to be worth a programme.",
};

export interface CopilotTask {
  id: string;
  horizon: Horizon;
  effort: Effort;
  /** Imperative, and specific enough to start without asking a question. */
  title: string;
  /** The measurement that put it on the list. */
  why: string;
  priority: Priority;
  impact: Impact;
  /**
   * Modelled additional clicks if it works. Absent when the underlying signal
   * does not support a click estimate — an engagement problem has no CTR curve.
   */
  estimatedClicks?: number;
  subject: string;
  subjectKind: SubjectKind;
  source: SignalSource;
  /** True when this stands for a group of pages rather than one. */
  isProgramme?: boolean;
}

/**
 * What fed this brief, and what did not.
 *
 * Rendered in the UI. A reader who does not know the Copilot never looked at
 * the technical audit will read its silence on crawl errors as "no crawl
 * errors", which is a fabrication by omission.
 */
export interface CoverageNote {
  label: string;
  status: "included" | "unavailable" | "not-run";
  detail: string;
}

/**
 * How much weight the brief deserves.
 *
 * Driven by data volume and forecast stability, not by how many findings there
 * are — a confident brief about a site with 200 impressions is the failure mode
 * this exists to prevent.
 */
export type Confidence = "high" | "medium" | "low";

export interface CopilotBrief {
  site: Site;
  range: DateRange;
  /** Paragraphs. Every sentence traceable to a number in this object. */
  executiveSummary: string[];
  wins: Highlight[];
  problems: Highlight[];
  /** Ranked upside, straight from the Action Center engine. */
  opportunities: ActionItem[];
  tasks: Record<Horizon, CopilotTask[]>;
  forecast: Forecast;
  /** The daily history the forecast extends, carried so the chart needs no second fetch. */
  history: TimeseriesPoint[];
  coverage: CoverageNote[];
  confidence: Confidence;
  /** True when the window held too little data to say anything responsible. */
  insufficientData: boolean;
  /** Total modelled clicks across every task on the list. */
  estimatedClicks: number;
}
