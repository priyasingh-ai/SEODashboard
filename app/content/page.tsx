"use client";

import * as React from "react";
import { Code2, FileSearch, Loader2, RefreshCw } from "lucide-react";
import { useFilters } from "@/hooks/use-filters";
import { useContentHealth } from "@/hooks/use-content-health";
import { useRegisterPageActions } from "@/hooks/use-page-actions";
import { ACTIVE_WEBSITES } from "@/lib/websites";
import { exportFilename } from "@/lib/export";
import { contentHealthExportColumns } from "@/lib/export-presets";
import { cn } from "@/lib/utils";
import type { ContentPageRow, SuggestionKind } from "@/lib/content/types";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ErrorState } from "@/components/dashboard/data-state";
import { DataTable } from "@/components/tables/data-table";
import { contentColumns } from "@/components/content/content-columns";
import { PageDetail } from "@/components/content/page-detail";

/**
 * Content Health.
 *
 * On demand for the same reason as the technical audit — it fetches live pages
 * and spends URL Inspection quota, so navigating here must not start a scan.
 *
 * Sorting comes from the table (every column has an accessor); the filters
 * here narrow the row set before it reaches the table, so the two compose
 * rather than fighting over the same state.
 */

type Filter =
  | "all"
  | "not-indexed"
  | "thin"
  | "stale"
  | "no-schema"
  | "no-meta"
  | "orphan"
  | "has-fixes";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All pages" },
  { value: "has-fixes", label: "Has suggestions" },
  { value: "not-indexed", label: "Not indexed" },
  { value: "thin", label: "Thin (<300 words)" },
  { value: "stale", label: "Stale" },
  { value: "orphan", label: "No inbound links" },
  { value: "no-schema", label: "No schema" },
  { value: "no-meta", label: "No meta" },
];

function matches(page: ContentPageRow, filter: Filter): boolean {
  switch (filter) {
    case "not-indexed":
      return page.indexStatus === "not-indexed" || page.indexStatus === "blocked";
    case "thin":
      return !page.fetchError && page.wordCount < 300;
    case "stale":
      return page.freshnessScore < 40;
    case "no-schema":
      return !page.fetchError && page.schemaTypes.length === 0;
    case "no-meta":
      return !page.fetchError && !page.metaDescription;
    case "orphan":
      return !page.fetchError && page.inboundLinks === 0;
    case "has-fixes":
      return page.suggestions.length > 0;
    default:
      return true;
  }
}

const SUGGESTION_FILTERS: { value: SuggestionKind | "any"; label: string }[] = [
  { value: "any", label: "Any type" },
  { value: "refresh", label: "Refresh" },
  { value: "internal-link", label: "Linking" },
  { value: "faq", label: "FAQ" },
  { value: "schema", label: "Schema" },
  { value: "title", label: "Title" },
  { value: "meta", label: "Meta" },
];

export default function ContentPage() {
  const { siteId, range, dateRange } = useFilters();
  const { data, error, isScanning, isIdle, scan } = useContentHealth();

  const [filter, setFilter] = React.useState<Filter>("all");
  const [kind, setKind] = React.useState<SuggestionKind | "any">("any");
  const [selected, setSelected] = React.useState<string>();

  const site = ACTIVE_WEBSITES.find((s) => s.id === siteId);

  useRegisterPageActions(
    {
      refresh: () => scan(true),
      getExport: () =>
        data && {
          filename: exportFilename([data.site.name, "content-health", range, dateRange.to]),
          title: `${data.site.name} — Content Health`,
          subtitle: `${data.site.domain} · ${data.fetched} of ${data.requested} pages analysed`,
          sections: [{ title: "Pages", rows: data.pages, columns: contentHealthExportColumns }],
        },
    },
    [data, scan, range, dateRange],
  );

  const rows = React.useMemo(() => {
    if (!data) return [];
    return data.pages
      .filter((p) => matches(p, filter))
      .filter((p) => kind === "any" || p.suggestions.some((s) => s.kind === kind));
  }, [data, filter, kind]);

  const selectedPage = data?.pages.find((p) => p.path === selected);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Content Health"
        description={
          data
            ? `${data.site.name} · ${data.fetched} of ${data.requested} pages analysed`
            : `${site?.name ?? "This site"} · scan to analyse content, metadata and linking`
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
        <ErrorState error={error} subject="content health" />
      ) : isIdle ? (
        <EmptyState
          icon={FileSearch}
          title="No scan run yet"
          description={`This fetches your top 25 pages by clicks from ${site?.domain ?? "your site"}, reads their content, and checks each against Search Console. It takes up to a minute and only runs when you ask.`}
          action={
            <Button onClick={() => scan()} size="sm" className="gap-1.5">
              <FileSearch className="h-3.5 w-3.5" />
              Run scan
            </Button>
          }
        />
      ) : isScanning && !data ? (
        <div className="space-y-4">
          <Skeleton className="h-[84px] rounded-xl" />
          <Skeleton className="h-[520px] rounded-xl" />
          <p className="text-center text-[13px] text-muted-foreground">
            Fetching pages, reading content, and inspecting index status.
          </p>
        </div>
      ) : data ? (
        <>
          {data.clientRendered > 0 && (
            <Card className="border-amber-200/70 p-4 dark:border-amber-500/20">
              <div className="flex items-start gap-2">
                <Code2
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                  strokeWidth={2}
                />
                <div className="min-w-0 text-[13px] leading-relaxed">
                  <p className="font-medium">
                    {data.clientRendered} of {data.fetched} pages render their content with
                    JavaScript
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    Their HTML is an empty shell, so word count, headings, internal links,
                    structured data and meta descriptions cannot be read for them. Those cells show
                    &ldquo;&mdash;&rdquo; because the values are <em>unknown</em>, not zero, and
                    those pages are excluded from the counts below. Googlebot does execute
                    JavaScript, but rendering is queued separately and can delay indexing — and
                    most AI answer engines do not execute it at all.
                  </p>
                </div>
              </div>
            </Card>
          )}

          <Card className="grid grid-cols-2 divide-border sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Pages analysed" value={data.fetched - data.clientRendered} />
            <Tile label="Not indexed" value={data.totals.notIndexed} tone={data.totals.notIndexed > 0} />
            <Tile label="Thin content" value={data.totals.thinPages} tone={data.totals.thinPages > 0} />
            <Tile label="No inbound links" value={data.totals.orphanPages} tone={data.totals.orphanPages > 0} />
            <Tile label="No schema" value={data.totals.missingSchema} tone={data.totals.missingSchema > 0} />
            <Tile label="No meta" value={data.totals.missingMeta} tone={data.totals.missingMeta > 0} />
          </Card>

          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((option) => (
              <Chip
                key={option.value}
                active={filter === option.value}
                onClick={() => setFilter(option.value)}
                label={option.label}
                count={
                  option.value === "all"
                    ? data.pages.length
                    : data.pages.filter((p) => matches(p, option.value)).length
                }
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-muted-foreground">Suggestion type:</span>
            {SUGGESTION_FILTERS.map((option) => (
              <Chip
                key={option.value}
                active={kind === option.value}
                onClick={() => setKind(option.value)}
                label={option.label}
              />
            ))}
          </div>

          <DataTable
            columns={contentColumns}
            data={rows}
            searchPlaceholder="Search pages…"
            searchKeys={["path", "title"]}
            pageSize={15}
            initialSort={[{ id: "impressions", desc: true }]}
            emptyTitle="No pages match"
            emptyDescription="No page in this scan matches the selected filters."
            onRowClick={(row) => setSelected(row.path === selected ? undefined : row.path)}
          />

          {selectedPage && (
            <PageDetail page={selectedPage} onClose={() => setSelected(undefined)} />
          )}

          <p className="text-[12px] leading-relaxed text-muted-foreground">
            <strong className="font-medium">AI readiness</strong> measures how extractable a page
            is — answer placement, question-shaped headings, structured data, cited sources. It is
            not a measure of whether AI answer engines cite the page: no search or AI provider
            exposes citation data, so nothing can measure that.{" "}
            <strong className="font-medium">Last updated</strong> is whatever the page declares and
            is often absent or touched by unrelated deploys.{" "}
            <strong className="font-medium">Inbound links</strong> are counted within the{" "}
            {data.fetched} scanned pages only, not site-wide. Word counts are approximate — template
            chrome cannot be perfectly separated from content without rendering.
          </p>
        </>
      ) : null}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: boolean }) {
  return (
    <div className="border-b border-r border-border p-4 last:border-r-0 sm:border-b-0">
      <div
        className={cn(
          "text-xl font-semibold tracking-tight tabular",
          tone && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </div>
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
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
      {count !== undefined && (
        <span className="text-[11px] text-muted-foreground tabular">{count}</span>
      )}
    </button>
  );
}
