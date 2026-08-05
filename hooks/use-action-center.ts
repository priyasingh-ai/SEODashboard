"use client";

import * as React from "react";
import { buildActionReport, type ActionReport } from "@/lib/actions";
import { useSiteReport } from "./use-reports";
import type { AsyncState } from "./use-async";

/**
 * The Action Center's data hook.
 *
 * Layers on top of `useSiteReport` rather than calling a new endpoint. The site
 * report already carries every query and page the rules need, and it is very
 * likely cached from another page in the session — so opening the Action Center
 * usually costs one memo and no network at all.
 *
 * The derivation is `useMemo`'d on the report object identity: the rules loop
 * over a few hundred rows and fit a curve, which is cheap, but not something to
 * repeat on every keystroke of a filter.
 */
export function useActionCenter(websiteId?: string): AsyncState<ActionReport> {
  const { data, error, isLoading, isRefreshing, refresh } = useSiteReport(websiteId);

  const report = React.useMemo(
    () => (data ? buildActionReport(data) : undefined),
    [data],
  );

  return { data: report, error, isLoading, isRefreshing, refresh };
}
