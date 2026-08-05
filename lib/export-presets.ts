import type {
  AcquisitionRow,
  DropOffRow,
  KeywordMovementRow,
  PagePerformanceRow,
  PageRow,
  PortfolioRow,
  QueryRow,
  SearchBreakdownRow,
} from "@/types";
import type { ExportColumn } from "./export";
import { IMPACT_LABEL, PRIORITY_LABEL, type ActionItem } from "./actions";
import type { CtrFinding, PageHealthRow, QueryOpportunity } from "./search-insights";
import { CHECK_LABELS, type TechnicalIssue } from "./technical/types";
import type { ContentPageRow } from "./content/types";
import type { GeoSuggestion } from "./geo/types";
import type { GapItem } from "./competitors/types";
import { EFFORT_LABEL, HORIZON_LABEL, SOURCE_LABEL, type CopilotTask } from "./copilot/types";
import { formatDuration, formatPercent, formatPosition } from "./format";

/**
 * Export column sets.
 *
 * Kept separate from the on-screen table columns on purpose: a spreadsheet wants
 * raw, unformatted numbers it can sum and sort, not "12.4K". Rates and durations
 * are the exception — those are formatted, because a bare 0.0412 is unreadable.
 */

export const queryExportColumns: ExportColumn<QueryRow>[] = [
  { header: "Keyword", value: (r) => r.keyword },
  { header: "Clicks", value: (r) => r.clicks },
  { header: "Impressions", value: (r) => r.impressions },
  { header: "CTR", value: (r) => formatPercent(r.ctr, 2) },
  { header: "Avg. Position", value: (r) => formatPosition(r.position) },
  { header: "Trend", value: (r) => formatPercent(r.trend, 1) },
];

export const pageExportColumns: ExportColumn<PageRow>[] = [
  { header: "Landing Page", value: (r) => r.page },
  { header: "Clicks", value: (r) => r.clicks },
  { header: "Impressions", value: (r) => r.impressions },
  { header: "CTR", value: (r) => formatPercent(r.ctr, 2) },
  { header: "Avg. Position", value: (r) => formatPosition(r.position) },
];

/**
 * Action Center export.
 *
 * Carries the recommendation text as well as the scores: the point of exporting
 * this is to hand it to whoever will do the work, and a priority with no
 * instruction attached is not actionable.
 */
export const actionExportColumns: ExportColumn<ActionItem>[] = [
  { header: "Priority", value: (r) => PRIORITY_LABEL[r.priority] },
  { header: "Opportunity Score", value: (r) => r.opportunityScore },
  { header: "Type", value: (r) => r.category },
  { header: "Subject", value: (r) => r.subject },
  { header: "Problem", value: (r) => r.problem },
  { header: "Recommended Action", value: (r) => r.recommendedAction },
  { header: "Estimated Impact", value: (r) => IMPACT_LABEL[r.impact] },
  { header: "Estimated Clicks", value: (r) => r.estimatedClicks },
];

/* -------------------------------------------------------------------------- */
/*  Competitors                                                                */
/* -------------------------------------------------------------------------- */

export const competitorGapExportColumns: ExportColumn<GapItem>[] = [
  { header: "Gap Type", value: (r) => r.kind },
  { header: "Severity", value: (r) => r.severity },
  { header: "Finding", value: (r) => r.title },
  { header: "Detail", value: (r) => r.detail },
  { header: "Competitor", value: (r) => r.competitor ?? "" },
  { header: "Recommended Action", value: (r) => r.recommendation },
];

/* -------------------------------------------------------------------------- */
/*  GEO                                                                        */
/* -------------------------------------------------------------------------- */

export const geoSuggestionExportColumns: ExportColumn<GeoSuggestion>[] = [
  { header: "Priority", value: (r) => r.priority },
  { header: "Signal", value: (r) => r.title },
  { header: "Finding", value: (r) => r.detail },
  { header: "Recommended Action", value: (r) => r.action },
];

/* -------------------------------------------------------------------------- */
/*  Content health                                                             */
/* -------------------------------------------------------------------------- */

export const contentHealthExportColumns: ExportColumn<ContentPageRow>[] = [
  { header: "Page", value: (r) => r.path },
  { header: "Index Status", value: (r) => r.indexStatus },
  { header: "Index Detail", value: (r) => r.indexDetail },
  { header: "Clicks", value: (r) => r.clicks },
  { header: "Impressions", value: (r) => r.impressions },
  { header: "CTR", value: (r) => formatPercent(r.ctr, 2) },
  { header: "Avg. Position", value: (r) => formatPosition(r.position) },
  { header: "Word Count", value: (r) => r.wordCount },
  { header: "Last Updated", value: (r) => r.lastUpdated ?? "" },
  { header: "Date Source", value: (r) => r.lastUpdatedSource ?? "" },
  { header: "Inbound Links (sample)", value: (r) => r.inboundLinks },
  { header: "Outbound Internal Links", value: (r) => r.outboundLinks },
  { header: "Schema Types", value: (r) => r.schemaTypes.join("; ") },
  { header: "Schema Valid", value: (r) => (r.schemaValid ? "Yes" : "No") },
  { header: "Title", value: (r) => r.title },
  { header: "Title Length", value: (r) => r.titleLength },
  { header: "Meta Description", value: (r) => r.metaDescription },
  { header: "Meta Length", value: (r) => r.metaLength },
  { header: "Freshness Score", value: (r) => r.freshnessScore },
  { header: "AI Readiness Score", value: (r) => r.aiReadinessScore },
  {
    header: "Suggestions",
    value: (r) => r.suggestions.map((s) => `[${s.priority}] ${s.title}`).join(" | "),
  },
];

/* -------------------------------------------------------------------------- */
/*  Technical SEO                                                              */
/* -------------------------------------------------------------------------- */

export const technicalIssueExportColumns: ExportColumn<TechnicalIssue>[] = [
  { header: "Check", value: (r) => CHECK_LABELS[r.check] },
  { header: "Severity", value: (r) => r.severity },
  { header: "Issue", value: (r) => r.title },
  { header: "Description", value: (r) => r.description },
  { header: "Affected Pages", value: (r) => r.affectedCount },
  { header: "Examples", value: (r) => r.affectedPages.join(" | ") },
  { header: "Suggested Fix", value: (r) => r.suggestedFix },
  { header: "Estimated Impact", value: (r) => r.estimatedImpact },
];

/* -------------------------------------------------------------------------- */
/*  Analytics intelligence                                                     */
/* -------------------------------------------------------------------------- */

export const acquisitionExportColumns: ExportColumn<AcquisitionRow>[] = [
  { header: "Source", value: (r) => r.label },
  { header: "Sessions", value: (r) => r.sessions },
  { header: "Share", value: (r) => formatPercent(r.share, 1) },
  { header: "Users", value: (r) => r.users },
  { header: "Engaged Sessions", value: (r) => r.engagedSessions },
  { header: "Engagement Rate", value: (r) => formatPercent(r.engagementRate, 1) },
  { header: "Key Events", value: (r) => r.keyEvents },
  { header: "Previous Sessions", value: (r) => r.prevSessions },
  { header: "Trend", value: (r) => formatPercent(r.trend, 1) },
];

export const pagePerformanceExportColumns: ExportColumn<PagePerformanceRow>[] = [
  { header: "Page", value: (r) => r.page },
  { header: "Score", value: (r) => r.score },
  { header: "Views", value: (r) => r.views },
  { header: "Users", value: (r) => r.users },
  { header: "Engagement Rate", value: (r) => formatPercent(r.engagementRate, 1) },
  { header: "Bounce Rate", value: (r) => formatPercent(r.bounceRate, 1) },
  { header: "Avg. Engagement Time", value: (r) => formatDuration(Math.round(r.avgEngagementTime)) },
];

export const dropOffExportColumns: ExportColumn<DropOffRow>[] = [
  { header: "Landing Page", value: (r) => r.page },
  { header: "Sessions", value: (r) => r.sessions },
  { header: "Left Without Engaging", value: (r) => r.lostSessions },
  { header: "Bounce Rate", value: (r) => formatPercent(r.bounceRate, 1) },
  { header: "Engagement Rate", value: (r) => formatPercent(r.engagementRate, 1) },
  { header: "Avg. Session Duration", value: (r) => formatDuration(Math.round(r.avgSessionDuration)) },
];

/* -------------------------------------------------------------------------- */
/*  Search Console intelligence                                                */
/* -------------------------------------------------------------------------- */

export const movementExportColumns: ExportColumn<KeywordMovementRow>[] = [
  { header: "Keyword", value: (r) => r.keyword },
  { header: "Change", value: (r) => r.kind },
  { header: "Position", value: (r) => (r.position === 0 ? "" : formatPosition(r.position)) },
  {
    header: "Previous Position",
    value: (r) => (r.prevPosition === 0 ? "" : formatPosition(r.prevPosition)),
  },
  { header: "Position Delta", value: (r) => (r.positionDelta === 0 ? "" : r.positionDelta) },
  { header: "Clicks", value: (r) => r.clicks },
  { header: "Previous Clicks", value: (r) => r.prevClicks },
  { header: "Impressions", value: (r) => r.impressions },
];

export const opportunityExportColumns: ExportColumn<QueryOpportunity>[] = [
  { header: "Keyword", value: (r) => r.keyword },
  { header: "Quick Win", value: (r) => (r.isQuickWin ? "Yes" : "No") },
  { header: "Clicks", value: (r) => r.clicks },
  { header: "Impressions", value: (r) => r.impressions },
  { header: "CTR", value: (r) => formatPercent(r.ctr, 2) },
  { header: "Expected CTR", value: (r) => formatPercent(r.expectedCtr, 2) },
  { header: "Avg. Position", value: (r) => formatPosition(r.position) },
  { header: "Potential Clicks", value: (r) => r.potentialClicks },
  { header: "Signals", value: (r) => r.reasons.join("; ") },
];

export const ctrFindingExportColumns: ExportColumn<CtrFinding>[] = [
  { header: "Page", value: (r) => r.page },
  { header: "Impressions", value: (r) => r.impressions },
  { header: "Clicks", value: (r) => r.clicks },
  { header: "CTR", value: (r) => formatPercent(r.ctr, 2) },
  { header: "Expected CTR", value: (r) => formatPercent(r.expectedCtr, 2) },
  { header: "Avg. Position", value: (r) => formatPosition(r.position) },
  { header: "Recoverable Clicks", value: (r) => r.potentialClicks },
];

export const pageHealthExportColumns: ExportColumn<PageHealthRow>[] = [
  { header: "Page", value: (r) => r.page },
  { header: "Health", value: (r) => r.health },
  { header: "Note", value: (r) => r.note },
  { header: "Clicks", value: (r) => r.clicks },
  { header: "Impressions", value: (r) => r.impressions },
  { header: "CTR", value: (r) => formatPercent(r.ctr, 2) },
  { header: "Avg. Position", value: (r) => formatPosition(r.position) },
  { header: "Trend (clicks)", value: (r) => formatPercent(r.trend, 1) },
  { header: "Growth (impressions)", value: (r) => formatPercent(r.growth, 1) },
];

export const breakdownExportColumns: ExportColumn<SearchBreakdownRow>[] = [
  { header: "Name", value: (r) => r.label },
  { header: "Code", value: (r) => r.key },
  { header: "Clicks", value: (r) => r.clicks },
  { header: "Share", value: (r) => formatPercent(r.share, 1) },
  { header: "Impressions", value: (r) => r.impressions },
  { header: "CTR", value: (r) => formatPercent(r.ctr, 2) },
  { header: "Avg. Position", value: (r) => formatPosition(r.position) },
  { header: "Trend", value: (r) => formatPercent(r.trend, 1) },
];

export const landingPageExportColumns: ExportColumn<PageRow>[] = [
  { header: "Landing Page", value: (r) => r.page },
  { header: "Users", value: (r) => r.users },
  { header: "Sessions", value: (r) => r.sessions },
  { header: "Clicks", value: (r) => r.clicks },
  { header: "Impressions", value: (r) => r.impressions },
  { header: "CTR", value: (r) => formatPercent(r.ctr, 2) },
  { header: "Avg. Position", value: (r) => formatPosition(r.position) },
  { header: "Avg. Engagement Time", value: (r) => formatDuration(r.avgEngagementTime) },
];

export const portfolioExportColumns: ExportColumn<PortfolioRow>[] = [
  { header: "Website", value: (r) => r.site.name },
  { header: "Domain", value: (r) => r.site.domain },
  { header: "Clicks", value: (r) => r.metrics.clicks.current },
  { header: "Impressions", value: (r) => r.metrics.impressions.current },
  { header: "Users", value: (r) => r.metrics.users.current },
  { header: "Sessions", value: (r) => r.metrics.sessions.current },
  { header: "CTR", value: (r) => formatPercent(r.metrics.ctr.current, 2) },
  { header: "Avg. Position", value: (r) => formatPosition(r.metrics.position.current) },
  { header: "Weekly Change", value: (r) => formatPercent(r.weeklyGrowth, 1) },
  { header: "Last Updated", value: (r) => r.site.lastSync },
];

/* -------------------------------------------------------------------------- */
/*  Copilot                                                                    */
/* -------------------------------------------------------------------------- */

export const copilotTaskExportColumns: ExportColumn<CopilotTask>[] = [
  { header: "When", value: (r) => HORIZON_LABEL[r.horizon] },
  { header: "Effort", value: (r) => EFFORT_LABEL[r.effort] },
  { header: "Priority", value: (r) => PRIORITY_LABEL[r.priority] },
  { header: "Task", value: (r) => r.title },
  { header: "Why", value: (r) => r.why },
  { header: "Subject", value: (r) => r.subject },
  { header: "Estimated Impact", value: (r) => IMPACT_LABEL[r.impact] },
  // Blank rather than 0 where no click model applies — an engagement task has
  // no CTR curve behind it, and a zero would read as "worth nothing".
  { header: "Estimated Clicks", value: (r) => (r.estimatedClicks ?? "") },
  { header: "Source", value: (r) => SOURCE_LABEL[r.source] },
];
