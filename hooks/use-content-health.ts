"use client";

import * as React from "react";
import { api } from "@/lib/api";
import type { ContentHealthReport } from "@/lib/content/types";
import { useFilters } from "./use-filters";

export interface ContentHealthState {
  data: ContentHealthReport | undefined;
  error: Error | undefined;
  isScanning: boolean;
  isIdle: boolean;
  scan: (force?: boolean) => void;
}

/**
 * Content health, run on demand.
 *
 * Mirrors `useTechnicalAudit` rather than `useAsync`: a scan fetches the
 * customer's live pages and spends URL Inspection quota, so it must never fire
 * as a side effect of navigation. Switching sites resets to idle instead of
 * auto-scanning the new one.
 */
export function useContentHealth(websiteId?: string): ContentHealthState {
  const { siteId, range, dateRange, compare } = useFilters();
  const id = websiteId ?? siteId;

  const [data, setData] = React.useState<ContentHealthReport>();
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
    (force = false) => {
      const run = ++runRef.current;
      setScanning(true);
      setIdle(false);
      setError(undefined);

      api
        .getContentHealth({
          websiteId: id,
          range,
          dateRange,
          comparePreviousPeriod: compare,
          refresh: force,
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
