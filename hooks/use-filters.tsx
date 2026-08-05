"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DateRange, RangeKey } from "@/types";
import { resolveRange } from "@/lib/date-range";
import { DEFAULT_WEBSITE_ID, isKnownWebsite } from "@/lib/websites";

/**
 * Filter state lives in the URL.
 *
 * That makes every view shareable and bookmarkable ("send me the link to
 * FWDPod's last 28 days"), survives refresh for free, and keeps a single source
 * of truth instead of a context that can drift from the address bar.
 *
 * The selected site is a special case: on `/site/[siteId]` the path *is* the
 * selection, so switching sites there navigates rather than rewriting a query
 * param. Everywhere else it rides in `?site=`.
 */

const VALID_RANGES: RangeKey[] = ["7d", "28d", "3m", "12m", "custom"];

export interface FiltersState {
  siteId: string;
  range: RangeKey;
  custom?: DateRange;
  compare: boolean;
  /** The resolved concrete window for the current range. */
  dateRange: DateRange;
  setSite: (siteId: string) => void;
  setRange: (range: RangeKey, custom?: DateRange) => void;
  setCompare: (compare: boolean) => void;
}

const FiltersContext = React.createContext<FiltersState | null>(null);

function isValidRange(v: string | null): v is RangeKey {
  return !!v && (VALID_RANGES as string[]).includes(v);
}

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // On a site route the path wins; elsewhere fall back to ?site=, then default.
  const pathSiteId = React.useMemo(() => {
    const match = /^\/site\/([^/]+)/.exec(pathname);
    return match?.[1];
  }, [pathname]);

  const querySite = params.get("site");
  const siteId =
    pathSiteId ??
    (querySite && isKnownWebsite(querySite) ? querySite : DEFAULT_WEBSITE_ID);

  const rangeParam = params.get("range");
  const range: RangeKey = isValidRange(rangeParam) ? rangeParam : "28d";

  const from = params.get("from");
  const to = params.get("to");
  const custom = from && to ? { from, to } : undefined;

  const compare = params.get("compare") !== "0"; // on by default

  const dateRange = React.useMemo(() => resolveRange(range, custom), [range, custom?.from, custom?.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const push = React.useCallback(
    (next: URLSearchParams, path = pathname) => {
      const qs = next.toString();
      // `scroll: false` keeps the viewport put when only a filter changed.
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    },
    [router, pathname],
  );

  const setSite = React.useCallback(
    (nextSite: string) => {
      const next = new URLSearchParams(params.toString());
      if (pathSiteId) {
        // Keep the range/compare filters, swap the route.
        next.delete("site");
        push(next, `/site/${nextSite}`);
      } else {
        if (nextSite === DEFAULT_WEBSITE_ID) next.delete("site");
        else next.set("site", nextSite);
        push(next);
      }
    },
    [params, pathSiteId, push],
  );

  const setRange = React.useCallback(
    (nextRange: RangeKey, nextCustom?: DateRange) => {
      const next = new URLSearchParams(params.toString());
      if (nextRange === "28d" && !nextCustom) next.delete("range");
      else next.set("range", nextRange);

      if (nextRange === "custom" && nextCustom) {
        next.set("from", nextCustom.from);
        next.set("to", nextCustom.to);
      } else {
        next.delete("from");
        next.delete("to");
      }
      push(next);
    },
    [params, push],
  );

  const setCompare = React.useCallback(
    (next: boolean) => {
      const p = new URLSearchParams(params.toString());
      if (next) p.delete("compare");
      else p.set("compare", "0");
      push(p);
    },
    [params, push],
  );

  const value = React.useMemo<FiltersState>(
    () => ({ siteId, range, custom, compare, dateRange, setSite, setRange, setCompare }),
    [siteId, range, custom?.from, custom?.to, compare, dateRange, setSite, setRange, setCompare], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters(): FiltersState {
  const ctx = React.useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters must be used inside <FiltersProvider>");
  return ctx;
}
