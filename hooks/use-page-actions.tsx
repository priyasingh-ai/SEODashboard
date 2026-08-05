"use client";

import * as React from "react";
import type { ExportColumn, PdfSection } from "@/lib/export";

/**
 * Lets the header act on whatever the current page is showing.
 *
 * The Refresh / Export CSV / Export PDF buttons live in the global header, but
 * only the page knows what "refresh" or "export" means for the data on screen.
 * Rather than hoisting every page's state into the layout, each page registers
 * its handlers here on mount and the header calls whatever is currently
 * registered.
 */

export interface ExportPayload {
  /** Base filename, without extension. */
  filename: string;
  /** PDF document heading. */
  title: string;
  /** PDF sub-heading — usually the site + date range. */
  subtitle: string;
  /** One table per PDF section. The first also becomes the CSV. */
  sections: PdfSection<any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface PageActions {
  refresh?: () => void;
  getExport?: () => ExportPayload | undefined;
}

interface PageActionsSnapshot {
  actions: PageActions;
  /** Bumped on every registration so the header re-renders with fresh handlers. */
  version: number;
}

/**
 * Two contexts, deliberately split — and the split is load-bearing, not tidiness.
 *
 * `register` is stable for the whole life of the provider; the snapshot changes
 * on every registration. If both rode in one context value, bumping the version
 * would hand every consumer a new value, re-rendering the very pages that call
 * `register` inside an effect. Any page whose effect dependencies aren't
 * referentially stable — e.g. a `refresh` built from several `useAsync` results,
 * which are new objects each render — would then re-register, bump the version,
 * re-render, and re-register again: an unbroken loop that React halts with
 * "Maximum update depth exceeded".
 *
 * Keeping `register` in its own context means the registering pages consume only
 * a value that never changes, so a version bump re-renders the header alone. The
 * mechanism is then immune to unstable dependency lists rather than relying on
 * every caller to memoise perfectly.
 */
const RegisterContext = React.createContext<(actions: PageActions) => void>(() => {});
const SnapshotContext = React.createContext<PageActionsSnapshot>({ actions: {}, version: 0 });

export function PageActionsProvider({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<PageActions>({});
  const [version, setVersion] = React.useState(0);

  const register = React.useCallback((next: PageActions) => {
    ref.current = next;
    setVersion((v) => v + 1);
  }, []);

  // Recomputed only when the version moves, capturing whatever `register` last
  // wrote to the ref. This is what the header reads.
  const snapshot = React.useMemo<PageActionsSnapshot>(
    () => ({ actions: ref.current, version }),
    [version],
  );

  return (
    <RegisterContext.Provider value={register}>
      <SnapshotContext.Provider value={snapshot}>{children}</SnapshotContext.Provider>
    </RegisterContext.Provider>
  );
}

/** Header side: read the currently registered handlers. */
export function usePageActions(): PageActions {
  return React.useContext(SnapshotContext).actions;
}

/**
 * Page side: publish this page's refresh + export handlers.
 *
 * `getExport` is a thunk rather than a value so the payload is only built when
 * someone actually clicks Export — serialising thousands of rows on every render
 * would be wasted work.
 */
export function useRegisterPageActions(actions: PageActions, deps: React.DependencyList) {
  const register = React.useContext(RegisterContext);

  // Keep the latest `actions` in a ref so the effect can publish it without
  // listing it as a dependency — it's an inline object, new every render.
  const actionsRef = React.useRef(actions);
  actionsRef.current = actions;

  React.useEffect(() => {
    register(actionsRef.current);
    return () => register({});
    // `register` is stable for the provider's lifetime, so the effect re-runs
    // only when the caller's own `deps` change — never as a feedback of the
    // registration itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, ...deps]);
}

export type { ExportColumn };
