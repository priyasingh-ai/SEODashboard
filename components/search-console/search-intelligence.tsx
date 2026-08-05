"use client";

import * as React from "react";
import type { SiteReportData } from "@/services/types";
import type { MovementWindow } from "@/types";
import { useKeywordMovement, useSearchBreakdowns } from "@/hooks/use-reports";
import type { SearchInsights } from "@/hooks/use-search-insights";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/dashboard/data-state";
import { SectionHeader } from "@/components/layout/page-header";
import { MovementPanel } from "./movement-panel";
import { OpportunitiesPanel } from "./opportunities-panel";
import { CtrPanel } from "./ctr-panel";
import { PageHealthPanel } from "./page-health-panel";
import { BreakdownTable } from "./breakdown-table";

/**
 * The Search Console intelligence block.
 *
 * Appended below the existing charts and tables rather than replacing them —
 * everything that was on this page before is untouched.
 *
 * Tabs, not a longer scroll: five analyses stacked vertically would bury the
 * last of them, and each answers a self-contained question. Only the two tabs
 * that need extra data fetch it, and only when opened.
 */
export function SearchIntelligence({
  report,
  insights,
}: {
  report: SiteReportData;
  insights: SearchInsights;
}) {
  const [window, setWindow] = React.useState<MovementWindow>("week");

  const movement = useKeywordMovement(window, report.site.id);
  const breakdowns = useSearchBreakdowns(report.site.id);

  const { baseline, opportunities, findings, health } = insights;

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Search intelligence"
        description="Derived from the same Search Console data as the tables above."
      />

      <Card className="p-4 sm:p-5">
        <Tabs defaultValue="movement">
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="movement">Movement</TabsTrigger>
            <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
            <TabsTrigger value="ctr">CTR</TabsTrigger>
            <TabsTrigger value="pages">Page health</TabsTrigger>
            <TabsTrigger value="audience">Country &amp; device</TabsTrigger>
          </TabsList>

          <TabsContent value="movement">
            {movement.error ? (
              <ErrorState error={movement.error} subject="keyword movement" />
            ) : (
              <MovementPanel
                data={movement.data}
                isLoading={movement.isLoading}
                window={window}
                onWindowChange={setWindow}
              />
            )}
          </TabsContent>

          <TabsContent value="opportunities">
            <OpportunitiesPanel opportunities={opportunities} baseline={baseline} />
          </TabsContent>

          <TabsContent value="ctr">
            <CtrPanel findings={findings} baseline={baseline} />
          </TabsContent>

          <TabsContent value="pages">
            <PageHealthPanel rows={health} />
          </TabsContent>

          <TabsContent value="audience">
            {breakdowns.error ? (
              <ErrorState error={breakdowns.error} subject="country and device data" />
            ) : breakdowns.isLoading || !breakdowns.data ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <Skeleton className="h-[320px] rounded-xl" />
                <Skeleton className="h-[320px] rounded-xl" />
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-[15px] font-semibold tracking-tight">
                      Country performance
                    </h3>
                    <p className="text-[13px] text-muted-foreground">
                      Search clicks by searcher location.
                    </p>
                  </div>
                  <BreakdownTable rows={breakdowns.data.countries} dimension="country" />
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="text-[15px] font-semibold tracking-tight">
                      Device performance
                    </h3>
                    <p className="text-[13px] text-muted-foreground">
                      Search clicks by device — distinct from the GA4 device split on the
                      Analytics page, which counts users rather than clicks.
                    </p>
                  </div>
                  <BreakdownTable rows={breakdowns.data.devices} dimension="device" />
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>
    </section>
  );
}
