"use client";

import * as React from "react";
import { Info, Loader2, Plus, Swords, X } from "lucide-react";
import { useFilters } from "@/hooks/use-filters";
import { useCompetitors } from "@/hooks/use-competitors";
import { useRegisterPageActions } from "@/hooks/use-page-actions";
import { ACTIVE_WEBSITES } from "@/lib/websites";
import { exportFilename } from "@/lib/export";
import { competitorGapExportColumns } from "@/lib/export-presets";
import { formatCompact, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CompetitorProfile, GapKind } from "@/lib/competitors/types";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ErrorState } from "@/components/dashboard/data-state";

/**
 * Competitor intelligence.
 *
 * Competitors are entered here rather than configured in a file, so the
 * comparison set can change without a deploy. On demand like every other scan —
 * this one crawls third-party servers.
 */

const GAP_LABELS: Record<GapKind, string> = {
  keyword: "Keyword gap",
  content: "Content gap",
  technical: "Technical gap",
  "ai-visibility": "AI visibility gap",
};

export default function CompetitorsPage() {
  const { siteId, range, dateRange } = useFilters();
  const { data, error, isScanning, isIdle, scan } = useCompetitors();

  const [domains, setDomains] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState("");

  const site = ACTIVE_WEBSITES.find((s) => s.id === siteId);

  const add = () => {
    const clean = draft
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) return;
    if (domains.includes(clean) || domains.length >= 4) return;
    setDomains([...domains, clean]);
    setDraft("");
  };

  useRegisterPageActions(
    {
      refresh: () => domains.length > 0 && scan(domains, true),
      getExport: () =>
        data && {
          filename: exportFilename([data.site.name, "competitors", range, dateRange.to]),
          title: `${data.site.name} — Competitor Intelligence`,
          subtitle: `vs ${data.competitors.map((c) => c.domain).join(", ")}`,
          sections: [{ title: "Gaps", rows: data.gaps, columns: competitorGapExportColumns }],
        },
    },
    [data, domains, scan, range, dateRange],
  );

  const all = data ? [data.self, ...data.competitors] : [];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <PageHeader
        title="Competitor Intelligence"
        description={
          data
            ? `${data.site.name} vs ${data.competitors.length} competitor${data.competitors.length === 1 ? "" : "s"}`
            : `${site?.name ?? "This site"} · compare against up to four competitors`
        }
        action={
          <Button
            onClick={() => scan(domains, true)}
            disabled={isScanning || domains.length === 0}
            size="sm"
            className="gap-1.5"
          >
            {isScanning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Scanning…
              </>
            ) : (
              <>
                <Swords className="h-3.5 w-3.5" />
                {data ? "Re-scan" : "Compare"}
              </>
            )}
          </Button>
        }
      />

      {/* Competitor input */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
            placeholder="competitor.com"
            aria-label="Competitor domain"
            className="w-[220px]"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={add}
            disabled={domains.length >= 4}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>

          {domains.map((domain) => (
            <span
              key={domain}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] font-medium"
            >
              {domain}
              <button
                type="button"
                onClick={() => setDomains(domains.filter((d) => d !== domain))}
                aria-label={`Remove ${domain}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {domains.length === 0 && (
            <span className="text-[12px] text-muted-foreground">
              Add up to four competitor domains, then press Compare.
            </span>
          )}
        </div>
      </Card>

      {error ? (
        <ErrorState error={error} subject="the competitor comparison" />
      ) : isIdle ? (
        <EmptyState
          icon={Swords}
          title="No comparison run yet"
          description="This crawls each competitor's public pages for structured data, published page counts, review markup and the topics they title pages around — then, if AI provider keys are set, asks the models category questions and scores every brand against the same answers."
        />
      ) : isScanning && !data ? (
        <div className="space-y-4">
          <Skeleton className="h-[220px] rounded-xl" />
          <Skeleton className="h-[280px] rounded-xl" />
        </div>
      ) : data ? (
        <>
          {/* Comparison matrix */}
          <section className="space-y-3">
            <SectionHeader title="Side by side" description="Measured the same way on every site." />
            <Card className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-3 text-left font-medium text-muted-foreground">Metric</th>
                    {all.map((p) => (
                      <th key={p.key} className="p-3 text-right font-medium">
                        <span className={cn(p.isSelf && "text-foreground")}>{p.name}</span>
                        {p.isSelf && (
                          <Badge variant="outline" className="ml-1.5">
                            You
                          </Badge>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <Row label="Pages published (sitemap)" values={all.map((p) => fmtNum(p.sitemapUrls))} />
                  <Row
                    label="Schema coverage"
                    values={all.map((p) =>
                      typeof p.schemaCoverage === "number" ? formatPercent(p.schemaCoverage, 0) : "—",
                    )}
                  />
                  <Row
                    label="Schema types"
                    values={all.map((p) => (p.schemaTypes.length ? String(p.schemaTypes.length) : "—"))}
                  />
                  <Row
                    label="Review rating"
                    values={all.map((p) =>
                      p.rating ? `${p.rating.value}★ (${formatCompact(p.rating.count)})` : "—",
                    )}
                  />
                  <Row
                    label="LCP (real users)"
                    values={all.map((p) => (p.cwv?.lcp ? `${(p.cwv.lcp / 1000).toFixed(1)}s` : "—"))}
                  />
                  <Row
                    label="Rendering"
                    values={all.map((p) =>
                      p.pagesFetched === 0 ? "—" : p.clientRendered > 0 ? "JavaScript" : "Server",
                    )}
                  />
                  <Row
                    label="AI mention rate"
                    values={all.map((p) =>
                      p.mentionRate === undefined ? "—" : formatPercent(p.mentionRate, 0),
                    )}
                  />
                </tbody>
              </table>
            </Card>
            {all.some((p) => p.status === "unreachable") && (
              <p className="text-[12px] text-muted-foreground">
                Unreachable:{" "}
                {all.filter((p) => p.status === "unreachable").map((p) => `${p.domain} (${p.error})`).join(", ")}
              </p>
            )}
          </section>

          {/* Gaps */}
          <section className="space-y-3">
            <SectionHeader
              title="Gap report"
              description="Only differences measured identically on both sides."
            />
            {data.gaps.length === 0 ? (
              <EmptyState
                inset
                title="No gaps found"
                description="Nothing measurable separates you from the competitors scanned. Adding AI provider and PageSpeed keys would widen what can be compared."
              />
            ) : (
              <div className="space-y-3">
                {data.gaps.map((gap, i) => (
                  <Card key={`${gap.kind}-${i}`} className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4",
                          gap.severity === "high"
                            ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                            : gap.severity === "medium"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                              : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {gap.severity}
                      </span>
                      <Badge variant="outline">{GAP_LABELS[gap.kind]}</Badge>
                      <span className="text-[13px] font-medium">{gap.title}</span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      {gap.detail}
                    </p>
                    <div className="mt-2.5 rounded-lg border border-border bg-secondary/40 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Recommended action
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed">{gap.recommendation}</p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* What is deliberately absent */}
          <section className="space-y-3">
            <SectionHeader
              title="Not compared"
              description="Metrics with no obtainable data, listed rather than estimated."
            />
            <div className="space-y-2">
              {data.unavailable.map((item) => (
                <Card key={item.metric} className="p-3">
                  <div className="flex items-start gap-2">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
                    <div className="min-w-0 text-[13px] leading-relaxed">
                      <span className="font-medium">{item.metric}</span>
                      <span className="text-muted-foreground"> — {item.reason}</span>
                      {item.alternative && (
                        <p className="mt-1 text-[12px] text-muted-foreground">{item.alternative}</p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function fmtNum(value?: number): string {
  return typeof value === "number" ? formatCompact(value) : "—";
}

function Row({ label, values }: { label: string; values: string[] }) {
  return (
    <tr>
      <td className="p-3 text-muted-foreground">{label}</td>
      {values.map((value, i) => (
        <td key={i} className="p-3 text-right tabular">
          {value}
        </td>
      ))}
    </tr>
  );
}
