"use client";

import * as React from "react";
import { Loader2, RadioTower, RefreshCw } from "lucide-react";
import { useFilters } from "@/hooks/use-filters";
import { useTechnicalAudit } from "@/hooks/use-technical-audit";
import { useRegisterPageActions } from "@/hooks/use-page-actions";
import { ACTIVE_WEBSITES } from "@/lib/websites";
import { exportFilename } from "@/lib/export";
import { technicalIssueExportColumns } from "@/lib/export-presets";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ErrorState } from "@/components/dashboard/data-state";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditSummary } from "@/components/technical/audit-summary";
import { CheckCard } from "@/components/technical/check-card";

/**
 * Technical SEO.
 *
 * The one page in this dashboard that does not load its data automatically.
 * A scan fetches the live site and spends Search Console's URL Inspection
 * quota, so it starts when someone presses the button and not before —
 * navigating here must never send traffic at somebody's production server.
 */
export default function TechnicalPage() {
  const { siteId, range, dateRange } = useFilters();
  const { data, error, isScanning, isIdle, scan } = useTechnicalAudit();

  const site = ACTIVE_WEBSITES.find((s) => s.id === siteId);

  useRegisterPageActions(
    {
      refresh: () => scan(true),
      getExport: () =>
        data && {
          filename: exportFilename([data.site.name, "technical-seo", range, dateRange.to]),
          title: `${data.site.name} — Technical SEO`,
          subtitle: `${data.site.domain} · ${data.pagesScanned} pages scanned · score ${data.score}/100`,
          sections: [
            {
              title: "Issues",
              rows: data.checks.flatMap((c) => c.issues),
              columns: technicalIssueExportColumns,
            },
          ],
        },
    },
    [data, scan, range, dateRange],
  );

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <PageHeader
        title="Technical SEO"
        description={
          data
            ? `${data.site.name} · ${data.pagesScanned} pages scanned`
            : `${site?.name ?? "This site"} · scan to check crawling, indexing and page health`
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
        <ErrorState error={error} subject="the technical audit" />
      ) : isIdle ? (
        <EmptyState
          icon={RadioTower}
          title="No scan run yet"
          description={`This audit fetches pages from ${site?.domain ?? "your site"} directly and inspects them against Search Console, so it only runs when you ask. It checks the top 20 pages by clicks plus the homepage, and takes up to a minute.`}
          action={
            <Button onClick={() => scan()} size="sm" className="gap-1.5">
              <RadioTower className="h-3.5 w-3.5" />
              Run scan
            </Button>
          }
        />
      ) : isScanning && !data ? (
        <div className="space-y-4">
          <Skeleton className="h-[150px] rounded-xl" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[78px] rounded-xl" />
            ))}
          </div>
          <p className="text-center text-[13px] text-muted-foreground">
            Fetching pages and inspecting index status. This can take up to a minute.
          </p>
        </div>
      ) : data ? (
        <>
          <AuditSummary audit={data} />

          <div className={isScanning ? "space-y-3 opacity-60 transition-opacity" : "space-y-3"}>
            {data.checks.map((check) => (
              <CheckCard key={check.check} check={check} />
            ))}
          </div>

          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Index status and canonical conflicts come from Search Console&rsquo;s URL Inspection
            API; everything else is measured by fetching the pages directly. Schema validation
            checks that structured data is present and parses — it is not Google&rsquo;s Rich
            Results Test, which has no public API. Mobile Usability reports only what the page
            markup shows, because Google retired that report in December 2023 and its API field
            now returns nothing for every URL.
          </p>
        </>
      ) : null}
    </div>
  );
}
