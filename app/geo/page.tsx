"use client";

import { Lightbulb, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useFilters } from "@/hooks/use-filters";
import { useGeo } from "@/hooks/use-geo";
import { useRegisterPageActions } from "@/hooks/use-page-actions";
import { ACTIVE_WEBSITES } from "@/lib/websites";
import { exportFilename } from "@/lib/export";
import { geoSuggestionExportColumns } from "@/lib/export-presets";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ErrorState } from "@/components/dashboard/data-state";
import { ProviderCard, ScoreCard, SignalCard } from "@/components/geo/geo-cards";

/**
 * GEO monitoring — visibility in AI answer engines.
 *
 * On demand like the other scans, and for a sharper reason: with provider keys
 * configured, every run bills real API calls to the key owner.
 */
export default function GeoPage() {
  const { siteId, range, dateRange } = useFilters();
  const { data, error, isScanning, isIdle, scan } = useGeo();

  const site = ACTIVE_WEBSITES.find((s) => s.id === siteId);

  useRegisterPageActions(
    {
      refresh: () => scan(true),
      getExport: () =>
        data && {
          filename: exportFilename([data.site.name, "geo", range, dateRange.to]),
          title: `${data.site.name} — GEO Monitoring`,
          subtitle: `${data.site.domain} · ${data.pagesAnalysed} pages analysed`,
          sections: [
            { title: "Improvements", rows: data.suggestions, columns: geoSuggestionExportColumns },
          ],
        },
    },
    [data, scan, range, dateRange],
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <PageHeader
        title="GEO Monitoring"
        description={
          data
            ? `${data.brand} · ${data.pagesAnalysed} pages analysed · ${formatRelativeTime(data.scannedAt, new Date().toISOString())}`
            : `${site?.name ?? "This site"} · visibility in AI answer engines`
        }
        action={
          <Button onClick={() => scan(true)} disabled={isScanning} size="sm" className="gap-1.5">
            {isScanning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Scanning…
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                {data ? "Re-scan" : "Run scan"}
              </>
            )}
          </Button>
        }
      />

      {error ? (
        <ErrorState error={error} subject="GEO monitoring" />
      ) : isIdle ? (
        <EmptyState
          icon={Sparkles}
          title="No scan run yet"
          description={`This reads your pages for entity and trust signals, and — if AI provider keys are set — asks ChatGPT, Gemini and Claude category questions to see whether ${site?.name ?? "your brand"} comes up unprompted. Those model calls are billed to your own API keys.`}
          action={
            <Button onClick={() => scan()} size="sm" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Run scan
            </Button>
          }
        />
      ) : isScanning && !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[140px] rounded-xl" />
          <Skeleton className="h-[320px] rounded-xl" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {data.scores.map((score) => (
              <ScoreCard key={score.id} score={score} />
            ))}
          </div>

          <section className="space-y-3">
            <SectionHeader
              title="Answer engine visibility"
              description="Category questions derived from queries this site ranks for, asked without naming the brand."
            />
            <div className="grid gap-3 md:grid-cols-3">
              {data.providers.map((provider) => (
                <ProviderCard key={provider.provider} result={provider} />
              ))}
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Model answers are non-deterministic, so each prompt is asked several times and the
              result is a rate with its sample size shown. This samples how a model responds to a
              defined prompt set — it is not a measure of what real users see, which no provider
              exposes.
            </p>
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Entity &amp; trust signals"
              description="Read directly from your pages — these need no third-party credential."
            />
            <div className="grid gap-3 lg:grid-cols-2">
              {data.signals.map((signal) => (
                <SignalCard key={signal.id} signal={signal} />
              ))}
            </div>
          </section>

          {data.suggestions.length > 0 && (
            <section className="space-y-3">
              <SectionHeader
                title="Suggested improvements"
                description="Ordered by how much each gap constrains entity recognition."
              />
              <div className="space-y-3">
                {data.suggestions.map((suggestion) => (
                  <Card key={suggestion.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4",
                          suggestion.priority === "high"
                            ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                            : suggestion.priority === "medium"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                              : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {suggestion.priority}
                      </span>
                      <span className="text-[13px] font-medium">{suggestion.title}</span>
                      <span className="text-[13px] text-muted-foreground">
                        — {suggestion.detail}
                      </span>
                    </div>
                    <div className="mt-2 rounded-lg border border-border bg-secondary/40 p-2.5">
                      <div className="flex items-center gap-1.5">
                        <Lightbulb
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          strokeWidth={2}
                        />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Recommended action
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed">{suggestion.action}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <p className="text-[12px] leading-relaxed text-muted-foreground">
            <strong className="font-medium">Google AI Overview</strong> is not tracked because no
            API exposes it — not Search Console, not any Google endpoint. Observing it requires
            scraping search results, which breaches Google&rsquo;s terms, so this module reports it
            as unavailable rather than estimating.{" "}
            <strong className="font-medium">Authority</strong> is built from entity recognition and
            model familiarity, not backlinks — no free API exposes link authority, so it does not
            approximate Domain Rating.{" "}
            <strong className="font-medium">Brand mentions</strong> beyond model answers would need
            a paid monitoring service.
          </p>
        </>
      ) : null}
    </div>
  );
}
