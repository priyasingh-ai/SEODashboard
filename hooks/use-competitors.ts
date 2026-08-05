"use client";

import * as React from "react";
import { api } from "@/lib/api";
import type { CompetitorReport } from "@/lib/competitors/types";
import { useFilters } from "./use-filters";

export interface CompetitorState {
  data: CompetitorReport | undefined;
  error: Error | undefined;
  isScanning: boolean;
  isIdle: boolean;
  scan: (competitors: string[], force?: boolean) => void;
}

/**
 * Competitor intelligence, run on demand.
 *
 * Crawls other people's servers and may bill model API calls, so it never fires
 * implicitly. The competitor list is passed at call time rather than held in
 * state here — the page owns that input and this hook stays a runner.
 */
export function useCompetitors(websiteId?: string): CompetitorState {
  const { siteId, range, dateRange, compare } = useFilters();
  const id = websiteId ?? siteId;

  const [data, setData] = React.useState<CompetitorReport>();
  const [error, setError] = React.useState<Error>();
  const [isScanning, setScanning] = React.useState(false);
  const [isIdle, setIdle] = React.useState(true);

  React.useEffect(() => {
    setData(undefined);
    setError(undefined);
    setIdle(true);
  }, [id]);

  const runRef = React.useRef(0);

  const scan = React.useCallback(
    (competitors: string[], force = false) => {
      const run = ++runRef.current;
      setScanning(true);
      setIdle(false);
      setError(undefined);

      api
        .getCompetitorReport({
          websiteId: id,
          range,
          dateRange,
          comparePreviousPeriod: compare,
          refresh: force,
          competitors,
        })
        .then((response) => {
          if (run !== runRef.current) return;
          setData(response.data);
          setScanning(false);
        })
        .catch((e: unknown) => {
          if (run !== runRef.current) return;
          setError(e instanceof Error ? e : new Error(String(e)));
          setScanning(false);
        });
    },
    [id, range, dateRange, compare],
  );

  return { data, error, isScanning, isIdle, scan };
}
