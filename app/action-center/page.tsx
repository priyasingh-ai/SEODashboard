"use client";

import * as React from "react";
import { CheckCircle2, Inbox } from "lucide-react";
import { useFilters } from "@/hooks/use-filters";
import { useActionCenter } from "@/hooks/use-action-center";
import { useRegisterPageActions } from "@/hooks/use-page-actions";
import { RANGE_LABELS, formatRange } from "@/lib/date-range";
import { exportFilename } from "@/lib/export";
import { actionExportColumns } from "@/lib/export-presets";
import { cn } from "@/lib/utils";
import type { ActionCategory, Priority } from "@/lib/actions";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ErrorState } from "@/components/dashboard/data-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionCard, CATEGORY_META } from "@/components/actions/action-card";
import { SummaryWidget } from "@/components/actions/summary-widget";

/**
 * Action Center — what to do, rather than what happened.
 *
 * Every other page in this dashboard answers "what are the numbers". This one
 * answers "what should I work on next", which is a different question and needs
 * a different shape: findings ranked by the size of the prize, each carrying the
 * evidence behind it and a concrete next step.
 *
 * The analysis is derived client-side from the already-fetched site report via
 * `useActionCenter`, so this page adds no API surface and no Google quota.
 */

type PriorityFilter = Priority | "all";

const PRIORITY_FILTERS: { value: PriorityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export default function ActionCenterPage() {
  const { range, dateRange } = useFilters();
  const { data, isLoading, error, refresh } = useActionCenter();

  const [priority, setPriority] = React.useState<PriorityFilter>("all");
  const [category, setCategory] = React.useState<ActionCategory | "all">("all");

  useRegisterPageActions(
    {
      refresh,
      getExport: () =>
        data && {
          filename: exportFilename([data.site.name, "action-center", range, dateRange.to]),
          title: `${data.site.name} — Action Center`,
          subtitle: `${data.site.domain} · ${RANGE_LABELS[range]} · ${formatRange(dateRange)}`,
          sections: [
            { title: "Actions", rows: data.actions, columns: actionExportColumns },
          ],
        },
    },
    [data, refresh, range, dateRange],
  );

  const visible = React.useMemo(() => {
    if (!data) return [];
    return data.actions.filter(
      (a) =>
        (priority === "all" || a.priority === priority) &&
        (category === "all" || a.category === category),
    );
  }, [data, priority, category]);

  if (error) {
    return <ErrorState error={error} subject="the action center" />;
  }

  // Only offer category chips for rules that actually fired.
  const activeCategories = data
    ? (Object.entries(data.summary.byCategory) as [ActionCategory, number][])
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Action Center"
        description={
          data ? `${data.site.name} · ${formatRange(dateRange)}` : formatRange(dateRange)
        }
      />

      {isLoading || !data ? (
        <>
          <Skeleton className="h-[184px] rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[380px] rounded-xl" />
            ))}
          </div>
        </>
      ) : data.summary.insufficientData ? (
        <EmptyState
          icon={Inbox}
          title="Not enough data to analyse yet"
          description="This property recorded too few impressions in this window to draw reliable conclusions. Try a wider date range — and note that Search Console lags 2–3 days behind today."
        />
      ) : data.actions.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing needs attention"
          description="No rankings dropped, no pages lost visibility, and no obvious click-through gaps in this window. Widen the date range to look further back."
        />
      ) : (
        <>
          <SummaryWidget summary={data.summary} />

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
              {PRIORITY_FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPriority(option.value)}
                  aria-pressed={priority === option.value}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                    priority === option.value
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <CategoryChip
                active={category === "all"}
                onClick={() => setCategory("all")}
                label="All types"
                count={data.summary.total}
              />
              {activeCategories.map(([key, count]) => (
                <CategoryChip
                  key={key}
                  active={category === key}
                  onClick={() => setCategory(key)}
                  label={CATEGORY_META[key].label}
                  count={count}
                />
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              inset
              icon={Inbox}
              title="Nothing matches this filter"
              description="No actions of this priority and type in the current window."
            />
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {visible.map((action) => (
                <ActionCard key={action.id} action={action} />
              ))}
            </div>
          )}

          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Opportunity scores are modelled from a click-through curve fitted to this
            property&rsquo;s own data, so they rank findings against each other within this site
            and window — they are not comparable between sites. Click estimates are projections,
            not forecasts. Indexing coverage is not included: it comes from Search Console&rsquo;s
            URL Inspection API, which this dashboard does not yet call.
          </p>
        </>
      )}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors",
        active
          ? "border-transparent bg-secondary text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span className="tabular text-[11px] text-muted-foreground">{count}</span>
    </button>
  );
}
