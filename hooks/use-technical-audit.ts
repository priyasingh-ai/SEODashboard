"use client";

import * as React from "react";
import { api } from "@/lib/api";
import type { TechnicalAudit } from "@/lib/technical/types";
import { useFilters } from "./use-filters";

export interface TechnicalAuditState {
  data: TechnicalAudit | undefined;
  error: Error | undefined;
  isScanning: boolean;
  /** No scan has been requested yet in this session. */
  isIdle: boolean;
  scan: (force?: boolean) => void;
}

/**
 * The technical audit, run on demand.
 *
 * Deliberately not built on `useAsync`, which fetches as soon as its key
 * changes. A technical scan sends real traffic to the customer's production
 * site and consumes Search Console's URL Inspection quota, so it must never be
 * a side effect of navigating to a page — it starts only when someone asks.
 *
 * Switching sites resets back to idle rather than auto-scanning the new one.
 */
export function useTechnicalAudit(websiteId?: string): TechnicalAuditState {
  const { siteId, range, dateRange, compare } = useFilters();
  const id = websiteId ?? siteId;

  const [data, setData] = React.useState<TechnicalAudit>();
  const [error, setError] = React.useState<Error>();
  const [isScanning, setScanning] = React.useState(false);
  const [isIdle, setIdle] = React.useState(true);

  // A scan belongs to the site it was run against; showing one site's audit
  // under another's name would be worse than showing nothing.
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
        .getTechnicalAudit({
          websiteId: id,
          range,
          dateRange,
          comparePreviousPeriod: compare,
          refresh: force,
        })
        .then((response) => {
          if (run !== runRef.current) return; // a newer scan already started
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
