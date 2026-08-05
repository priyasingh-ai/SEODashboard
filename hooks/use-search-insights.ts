"use client";

import * as React from "react";
import type { SiteReportData } from "@/services/types";
import {
  ctrFindings,
  pageHealth,
  queryOpportunities,
  searchBaseline,
  type CtrFinding,
  type PageHealthRow,
  type QueryOpportunity,
  type SearchBaseline,
} from "@/lib/search-insights";

export interface SearchInsights {
  baseline: SearchBaseline;
  opportunities: QueryOpportunity[];
  findings: CtrFinding[];
  health: PageHealthRow[];
}

/**
 * Derived Search Console analysis for a site report.
 *
 * Computed once at the page and passed down, rather than memoised inside each
 * panel: the page needs the same rows for CSV export, and two `useMemo`s over
 * the same input would fit the CTR curve twice per render pass.
 *
 * Everything here is derived from data already fetched — this hook issues no
 * requests.
 */
export function useSearchInsights(report: SiteReportData | undefined): SearchInsights | undefined {
  return React.useMemo(() => {
    if (!report) return undefined;

    const baseline = searchBaseline(report.queries, report.pages);
    return {
      baseline,
      opportunities: queryOpportunities(report.queries, baseline),
      findings: ctrFindings(report.pages, baseline),
      health: pageHealth(report.pages),
    };
  }, [report]);
}
