import { daysBetween } from "@/lib/date-range";
import { formatCompact, formatPercent, formatPosition } from "@/lib/format";
import type { DateRange, Metrics } from "@/types";
import type { Forecast } from "./forecast";
import type { CopilotTask, Highlight, Horizon } from "./types";

/**
 * The executive summary, written deterministically.
 *
 * There is no language model in this file, and the reason is worth stating.
 * The summary's only job is to be *true*: a reader who acts on it must not be
 * able to find a number in it that the tables below contradict. Templates with
 * real values substituted in are trivially auditable against that standard;
 * generated prose is not, and no amount of prompting makes it so. A model asked
 * to summarise metrics will, sooner or later, round 4.8% to "nearly 5%",
 * describe a 3% rise as "significant", or attribute a decline to a cause it
 * inferred from nothing.
 *
 * The cost of this choice is that the writing has a shape you can learn to
 * recognise. That is a fair price for never having to check it.
 *
 * Every sentence here follows one rule: state what changed, state what it was
 * composed of, and stop. Nothing in this file explains *why* a number moved,
 * because the data cannot support that and a plausible guess sitting beside
 * accurate figures inherits their credibility.
 */

function windowPhrase(range: DateRange): string {
  const days = daysBetween(range.from, range.to) + 1;
  if (days <= 8) return "the past week";
  if (days <= 32) return `the past ${days} days`;
  if (days <= 100) return `the past ${Math.round(days / 30)} months`;
  return `the past ${Math.round(days / 30)} months`;
}

function verb(change: number): string {
  if (Math.abs(change) < 0.02) return "held roughly flat";
  return change > 0 ? "rose" : "fell";
}

/**
 * Opening paragraph: the site's own numbers, decomposed.
 *
 * Impressions × CTR = clicks is an identity, so naming which side moved is
 * arithmetic. Naming *why* it moved would not be, which is where this stops.
 */
function performance(metrics: Metrics, range: DateRange): string {
  const { clicks, impressions, ctr, position } = metrics;
  const window = windowPhrase(range);

  if (clicks.previous === 0 && clicks.current === 0) {
    return `Search Console reported no clicks over ${window}. Either the property is newly connected or it is not yet ranking for anything that draws traffic — both look the same from here.`;
  }

  if (clicks.previous === 0) {
    return `Over ${window} the site drew ${formatCompact(clicks.current)} clicks from ${formatCompact(impressions.current)} impressions, against nothing in the preceding window. With no baseline there is no growth rate to quote; the figure is a starting point rather than a change.`;
  }

  const flat = Math.abs(clicks.change) < 0.02;
  const lead = flat
    ? `Over ${window} clicks held roughly flat at ${formatCompact(clicks.current)}`
    : `Over ${window} clicks ${verb(clicks.change)} ${formatPercent(Math.abs(clicks.change), 0)} to ${formatCompact(clicks.current)}`;

  // Clicks = impressions × CTR, so exactly one of three things is true, and the
  // three cases must be handled separately.
  //
  // The case that is easy to get wrong is the third: impressions and clicks
  // moving in *opposite* directions. Treating that as "impressions barely
  // moved" — which a threshold on magnitude alone will do, since a 43% fall is
  // smaller than a 109% rise — produces the sentence "the site was shown about
  // as often" about a site whose reach nearly halved. That is a false statement
  // sitting directly above the table that contradicts it.
  const diverged =
    Math.abs(impressions.change) >= 0.05 &&
    Math.sign(impressions.change) !== Math.sign(clicks.change);
  const reachLed = Math.abs(impressions.change) >= Math.abs(clicks.change) / 2;

  const composition = flat
    ? `on ${formatCompact(impressions.current)} impressions at ${formatPercent(ctr.current)} click-through`
    : diverged
      ? `even though impressions ${verb(impressions.change)} ${formatPercent(Math.abs(impressions.change), 0)} to ${formatCompact(impressions.current)} — the two moved in opposite directions, so click-through carried the whole change, from ${formatPercent(ctr.previous)} to ${formatPercent(ctr.current)}`
      : reachLed
        ? `on impressions that ${verb(impressions.change)} ${formatPercent(Math.abs(impressions.change), 0)} — this is a change in how often the site was shown, not in how often it was clicked`
        : `while impressions moved only ${formatPercent(Math.abs(impressions.change), 0)} — the site was shown about as often and clicked ${clicks.change > 0 ? "more" : "less"}, with click-through at ${formatPercent(ctr.current)}`;

  return `${lead}, ${composition}. Average position sits at ${formatPosition(position.current)}.`;
}

/**
 * Second paragraph: the largest single mover in each direction.
 *
 * Site-level highlights are skipped here. The first paragraph is *about* the
 * site-level number, so promoting it again produces "the biggest single gain
 * came from clicks rose 109%" — the aggregate offered as its own explanation.
 * What this paragraph is for is the specific page, keyword or channel
 * underneath it.
 */
function movers(wins: Highlight[], problems: Highlight[]): string | undefined {
  const specific = (list: Highlight[]) => list.find((h) => !h.id.endsWith(":site-clicks"));
  const win = specific(wins);
  const problem = specific(problems);
  if (!win && !problem) return undefined;

  if (win && problem) {
    return `The clearest thing going right: ${clause(win.title)}. Against it: ${clause(problem.title)}.`;
  }
  if (win) {
    return `The clearest thing going right: ${clause(win.title)}. Nothing declined by enough to be worth naming.`;
  }
  return `The clearest problem: ${clause(problem!.title)}. Nothing grew by enough to offset it.`;
}

/**
 * Prepare a highlight title for embedding mid-sentence.
 *
 * Two things to get right. Titles are written as standalone sentences, so some
 * already end in a full stop and produce ".." when a period follows — small,
 * but it is the kind of detail that makes a reader wonder what else is
 * unchecked. And the leading capital is only lowered when it is ordinary
 * prose: a quoted keyword, a URL path, or an acronym must keep its case.
 *
 * The framing around this is deliberately neutral ("the clearest thing going
 * right") rather than "the biggest gain". Not every positive highlight is a
 * change — some are standings, like a page ranked best on the site — and
 * calling a standing a gain invents movement that never happened.
 */
function clause(sentence: string): string {
  const trimmed = sentence.replace(/\.\s*$/, "");
  if (/^["/]/.test(trimmed) || /^[A-Z]{2}/.test(trimmed)) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

/** Third paragraph: the projection, or the reason there isn't one. */
function outlook(forecast: Forecast): string {
  if (forecast.status !== "ok") {
    return `No traffic projection is offered for this window. ${forecast.reason}`;
  }

  const opening = `If the last ${forecast.trendDays} days continue as they have, the next ${forecast.horizonDays} would bring somewhere between ${formatCompact(forecast.lower)} and ${formatCompact(forecast.upper)} clicks, against ${formatCompact(forecast.baseline)} in the ${forecast.horizonDays} days just past.`;

  // When the interval is wider than the number it is compared against, the
  // midpoint carries no information about direction — the band spans growth and
  // decline alike. Quoting "3% above" off that midpoint would be a precise
  // statement about noise, which is the most persuasive kind of wrong.
  if (forecast.upper - forecast.lower > forecast.baseline) {
    return `${opening} That range is wider than the baseline itself, so it supports no claim about direction — only that traffic at this volume swings enough that a month is not predictable from the trend alone.`;
  }

  const direction =
    Math.abs(forecast.change) < 0.05
      ? "roughly level"
      : forecast.change > 0
        ? `about ${formatPercent(forecast.change, 0)} up`
        : `about ${formatPercent(Math.abs(forecast.change), 0)} down`;

  return `${opening} The midpoint is ${direction}. That range assumes nothing changes, which is the one thing it cannot check.`;
}

/** Closing paragraph: what to do first, and what it is modelled to be worth. */
function nextStep(tasks: Record<Horizon, CopilotTask[]>, estimatedClicks: number): string | undefined {
  const first = tasks.today[0] ?? tasks.week[0];
  if (!first) return undefined;

  const total = tasks.today.length + tasks.week.length + tasks.month.length;
  const worth =
    estimatedClicks >= 1
      ? ` Across all ${total} items the modelled upside is about ${formatCompact(Math.round(estimatedClicks))} additional clicks over a window this length — a model fitted to this site's own click-through by position, not a promise.`
      : "";

  return `Start with: ${first.title}${first.title.endsWith(".") ? "" : "."}${worth}`;
}

export function buildExecutiveSummary(input: {
  metrics: Metrics;
  range: DateRange;
  wins: Highlight[];
  problems: Highlight[];
  forecast: Forecast;
  tasks: Record<Horizon, CopilotTask[]>;
  estimatedClicks: number;
}): string[] {
  return [
    performance(input.metrics, input.range),
    movers(input.wins, input.problems),
    outlook(input.forecast),
    nextStep(input.tasks, input.estimatedClicks),
  ].filter((p): p is string => Boolean(p));
}
