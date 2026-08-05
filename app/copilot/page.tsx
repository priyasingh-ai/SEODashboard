"use client";

import * as React from "react";
import { Bot, Check, CircleSlash, Info, TriangleAlert } from "lucide-react";
import { useCopilot } from "@/hooks/use-copilot";
import { useFilters } from "@/hooks/use-filters";
import { useRegisterPageActions } from "@/hooks/use-page-actions";
import { exportFilename } from "@/lib/export";
import { copilotTaskExportColumns } from "@/lib/export-presets";
import { formatCompact, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Confidence, CoverageNote, Horizon } from "@/lib/copilot";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/dashboard/data-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ActionCard } from "@/components/actions/action-card";
import { ForecastChart } from "@/components/charts/lazy";
import { HighlightCard } from "@/components/copilot/highlight-card";
import { TaskList } from "@/components/copilot/task-list";

/**
 * The AI SEO Copilot.
 *
 * A briefing, read top to bottom: what happened, what is going right, what is
 * going wrong, where it is heading, and what to do about it today, this week
 * and this month.
 *
 * Nothing on this page is generated text. Every sentence is assembled from
 * numbers computed elsewhere in the dashboard, which is why the coverage panel
 * at the bottom matters as much as the summary at the top — it is the only
 * thing telling the reader what the brief could not see.
 */

const CONFIDENCE_COPY: Record<Confidence, { label: string; detail: string; tone: string }> = {
  high: {
    label: "High confidence",
    detail:
      "Enough volume for rates to be stable, a trend the data actually follows, and both Search Console and Analytics feeding the brief.",
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  medium: {
    label: "Medium confidence",
    detail:
      "Either the volume or the trend stability is short of comfortable. The findings are real; the ordering between close ones is less certain.",
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  low: {
    label: "Low confidence",
    detail:
      "Thin data. Treat everything here as a hypothesis to check rather than a conclusion to act on.",
    tone: "bg-secondary text-muted-foreground",
  },
};

const COVERAGE_ICON = {
  included: Check,
  unavailable: CircleSlash,
  "not-run": Info,
} satisfies Record<CoverageNote["status"], typeof Check>;

const HORIZONS: Horizon[] = ["today", "week", "month"];

export default function CopilotPage() {
  const { range, dateRange } = useFilters();
  const { data, error, isLoading, isRefreshing, refresh } = useCopilot();

  useRegisterPageActions(
    {
      refresh,
      getExport: () =>
        data && {
          filename: exportFilename([data.site.name, "copilot-plan", range, dateRange.to]),
          title: `${data.site.name} — SEO Copilot plan`,
          subtitle: data.executiveSummary[0],
          sections: HORIZONS.map((h) => ({
            title: h === "today" ? "Today" : h === "week" ? "This week" : "This month",
            rows: data.tasks[h],
            columns: copilotTaskExportColumns,
          })),
        },
    },
    [data, refresh, range, dateRange],
  );

  if (error) return <ErrorState error={error} subject="the Copilot brief" />;

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6">
        <Skeleton className="h-[132px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[240px] rounded-xl" />
      </div>
    );
  }

  const confidence = CONFIDENCE_COPY[data.confidence];
  const taskCount = HORIZONS.reduce((sum, h) => sum + data.tasks[h].length, 0);

  return (
    <div className="mx-auto max-w-[1200px] space-y-8">
      <PageHeader
        title="AI SEO Copilot"
        description={`${data.site.name} · ${taskCount} scheduled ${taskCount === 1 ? "task" : "tasks"}${
          data.estimatedClicks >= 1
            ? ` · ~${formatCompact(Math.round(data.estimatedClicks))} clicks modelled`
            : ""
        }`}
        action={
          <span
            className={cn(
              "inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium",
              confidence.tone,
            )}
            title={confidence.detail}
          >
            {confidence.label}
          </span>
        }
      />

      {/* Executive summary */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <Bot className="h-4 w-4 text-muted-foreground" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0 space-y-3">
            {data.executiveSummary.map((paragraph, i) => (
              <p
                key={i}
                className={cn(
                  "text-[14px] leading-relaxed",
                  i === 0 ? "font-medium" : "text-muted-foreground",
                )}
              >
                {paragraph}
              </p>
            ))}
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {confidence.detail}
            </p>
          </div>
        </div>
      </Card>

      {data.insufficientData ? (
        <EmptyState
          icon={TriangleAlert}
          title="Not enough data to brief on"
          description="The window is below the volume where any of this analysis means anything. Widen the date range."
        />
      ) : (
        <>
          {/* Wins and problems */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-3">
              <SectionHeader
                title="Biggest wins"
                description="Ranked by clicks gained, not by percentage."
              />
              {data.wins.length === 0 ? (
                <EmptyState
                  inset
                  title="Nothing moved up materially"
                  description="No change cleared the noise floor in this window."
                />
              ) : (
                <div className="space-y-3">
                  {data.wins.map((w) => (
                    <HighlightCard key={w.id} highlight={w} positive />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <SectionHeader
                title="Biggest problems"
                description="Ranked by clicks lost, on the same scale as the wins."
              />
              {data.problems.length === 0 ? (
                <EmptyState
                  inset
                  title="Nothing declined materially"
                  description="No drop cleared the noise floor in this window."
                />
              ) : (
                <div className="space-y-3">
                  {data.problems.map((p) => (
                    <HighlightCard key={p.id} highlight={p} positive={false} />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Forecast */}
          <section className="space-y-3">
            <SectionHeader
              title="Where traffic is heading"
              description="A projection of the current trend, not a prediction of the future."
            />
            <Card className="p-5">
              {data.forecast.status !== "ok" ? (
                <EmptyState
                  inset
                  icon={CircleSlash}
                  title="No projection offered"
                  description={data.forecast.reason}
                />
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                    <div>
                      <div className="text-[11px] text-muted-foreground">
                        Next {data.forecast.horizonDays} days
                      </div>
                      <div className="text-[20px] font-semibold tabular">
                        {formatCompact(data.forecast.lower)} – {formatCompact(data.forecast.upper)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">
                        Previous {data.forecast.horizonDays} days
                      </div>
                      <div className="text-[15px] tabular">
                        {formatCompact(data.forecast.baseline)}
                      </div>
                    </div>
                    <Badge variant="outline">
                      Midpoint {formatPercent(data.forecast.change, 0)} vs. now
                    </Badge>
                    <Badge variant="outline">
                      Trend explains {formatPercent(data.forecast.fit, 0)} of daily variation
                    </Badge>
                  </div>

                  <ForecastChart history={data.history} forecast={data.forecast} />

                  <ul className="mt-4 space-y-1.5">
                    {data.forecast.caveats.map((caveat, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground"
                      >
                        <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
                        {caveat}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </section>

          {/* Opportunities */}
          <section className="space-y-3">
            <SectionHeader
              title="Top opportunities"
              description="Upside to capture, ranked by modelled clicks. Regressions appear under problems instead."
            />
            {data.opportunities.length === 0 ? (
              <EmptyState
                inset
                title="No untapped upside found"
                description="Every finding in this window is ground lost rather than ground available."
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {data.opportunities.map((action) => (
                  <ActionCard key={action.id} action={action} />
                ))}
              </div>
            )}
          </section>

          {/* The plan */}
          <section className="space-y-4">
            <SectionHeader
              title="The plan"
              description="The same findings, scheduled by how much work each fix is."
            />
            <div className="grid gap-6 lg:grid-cols-3">
              {HORIZONS.map((horizon) => (
                <TaskList key={horizon} horizon={horizon} tasks={data.tasks[horizon]} />
              ))}
            </div>
          </section>
        </>
      )}

      {/* Coverage */}
      <section className="space-y-3">
        <SectionHeader
          title="What fed this brief"
          description="And what did not — silence on a topic here is not a clean bill of health."
        />
        <div className="space-y-2">
          {data.coverage.map((note) => {
            const Icon = COVERAGE_ICON[note.status];
            return (
              <Card key={note.label} className="p-3">
                <div className="flex items-start gap-2">
                  <Icon
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0",
                      note.status === "included"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground",
                    )}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <div className="min-w-0 text-[13px] leading-relaxed">
                    <span className="font-medium">{note.label}</span>
                    <span className="text-muted-foreground"> — {note.detail}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {isRefreshing && (
        <p className="text-[12px] text-muted-foreground">Refreshing supporting data…</p>
      )}
    </div>
  );
}
