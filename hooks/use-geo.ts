"use client";

import * as React from "react";
import { api } from "@/lib/api";
import type { GeoReport } from "@/lib/geo/types";
import { useFilters } from "./use-filters";

export interface GeoState {
  data: GeoReport | undefined;
  error: Error | undefined;
  isScanning: boolean;
  isIdle: boolean;
  scan: (force?: boolean) => void;
}

/**
 * GEO monitoring, run on demand.
 *
 * Same contract as the other scans, with a sharper reason: when AI provider
 * keys are configured, each run bills real API calls. It must never fire as a
 * side effect of navigation.
 */
export function useGeo(websiteId?: string): GeoState {
  const { siteId, range, dateRange, compare } = useFilters();
  const id = websiteId ?? siteId;

  const [data, setData] = React.useState<GeoReport>();
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
        .getGeoReport({
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
