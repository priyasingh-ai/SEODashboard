"use client";

import { ExternalLink, Lightbulb, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber, formatPercent, formatPosition } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SUGGESTION_LABELS, type ContentPageRow, type ContentSuggestion } from "@/lib/content/types";
import { IndexBadge, ScorePill } from "./content-columns";

/**
 * The selected page: every metric, then the generated suggestions.
 *
 * The suggestions carry their own evidence, so a reader can check each one
 * against the numbers above rather than taking it on trust.
 */
export function PageDetail({
  page,
  onClose,
  className,
}: {
  page: ContentPageRow;
  onClose: () => void;
  className?: string;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold tracking-tight" title={page.path}>
              {page.path}
            </h3>
            <a
              href={page.url}
              target="_blank"
              rel="noreferrer noopener"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Open page in a new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
            </a>
          </div>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground" title={page.title}>
            {page.title || "No title tag"}
          </p>
        </div>

        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close detail">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {page.fetchError ? (
        <p className="mt-4 rounded-lg border border-red-200/70 bg-red-50 p-3 text-[13px] leading-relaxed text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          This page could not be fetched ({page.fetchError}), so no content signals are available.
          Search Console metrics above are still accurate.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Metric label="Index status" value={<IndexBadge status={page.indexStatus} detail={page.indexDetail} />} />
            <Metric label="Clicks" value={formatNumber(page.clicks)} />
            <Metric label="Impressions" value={formatNumber(page.impressions)} />
            <Metric label="CTR" value={formatPercent(page.ctr, 2)} />
            <Metric label="Position" value={formatPosition(page.position)} />
            <Metric label="Word count" value={formatNumber(page.wordCount)} />
            <Metric
              label="Last updated"
              value={page.lastUpdated ?? "Not declared"}
              hint={page.lastUpdatedSource ? `Source: ${page.lastUpdatedSource}` : undefined}
            />
            <Metric
              label="Internal links"
              value={`${page.inboundLinks} in / ${page.outboundLinks} out`}
              hint="Inbound counted within the scanned sample only"
            />
            <Metric
              label="Schema"
              value={
                !page.schemaValid
                  ? "Invalid JSON-LD"
                  : page.schemaTypes.length
                    ? page.schemaTypes.join(", ")
                    : "None"
              }
            />
            <Metric label="Title length" value={`${page.titleLength} chars`} />
            <Metric label="Freshness" value={<ScorePill score={page.freshnessScore} />} />
            <Metric
              label="AI readiness"
              value={<ScorePill score={page.aiReadinessScore} />}
              hint="How extractable this page is — not whether AI engines cite it"
            />
          </dl>

          <div className="mt-5 space-y-2">
            <div className="flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
              <h4 className="text-[13px] font-semibold tracking-tight">
                Suggestions {page.suggestions.length > 0 && `(${page.suggestions.length})`}
              </h4>
            </div>

            {page.suggestions.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Nothing flagged for this page. Its content, metadata and linking all pass the
                checks.
              </p>
            ) : (
              page.suggestions.map((suggestion, i) => (
                <SuggestionRow key={`${suggestion.kind}-${i}`} suggestion={suggestion} />
              ))
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-muted-foreground" title={hint}>
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13px] font-medium tabular">{value}</dd>
    </div>
  );
}

const PRIORITY_TONE = {
  high: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  medium: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  low: "bg-secondary text-muted-foreground",
} as const;

function SuggestionRow({ suggestion }: { suggestion: ContentSuggestion }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4",
            PRIORITY_TONE[suggestion.priority],
          )}
        >
          {suggestion.priority}
        </span>
        <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {SUGGESTION_LABELS[suggestion.kind]}
        </span>
        <span className="text-[13px] font-medium">{suggestion.title}</span>
      </div>

      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {suggestion.detail}
      </p>

      {suggestion.action && (
        <p className="mt-2 rounded-md bg-secondary/50 p-2 text-[13px] leading-relaxed">
          {suggestion.action}
        </p>
      )}
    </div>
  );
}
