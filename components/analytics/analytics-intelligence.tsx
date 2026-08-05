"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import type { AnalyticsInsightsData } from "@/services/types";
import { buildNarrative } from "@/lib/analytics-narrative";
import { formatCompact, formatDuration, formatPercent } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { InsightCard } from "./insight-card";
import { JourneyFunnel } from "./journey-funnel";
import {
  AcquisitionTable,
  AudienceSplit,
  ConversionsPanel,
  DropOffTable,
  PagePerformanceTable,
} from "./analytics-tables";

/**
 * The Analytics intelligence block.
 *
 * Appended below the existing charts — nothing that was on this page before has
 * moved or changed. Tabs rather than a longer scroll, matching the Search
 * Console page, because each section answers a self-contained question.
 */
export function AnalyticsIntelligence({ data }: { data: AnalyticsInsightsData }) {
  const insights = React.useMemo(() => buildNarrative(data), [data]);
  const { engagement: now, previousEngagement: before } = data;

  const delta = (current: number, previous: number) =>
    previous === 0 ? (current === 0 ? 0 : 1) : (current - previous) / previous;

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Analytics intelligence"
        description="Engagement, acquisition and page performance, with generated observations."
      />

      {insights.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
            <h3 className="text-[13px] font-semibold tracking-tight">Insights</h3>
            <span className="text-[11px] text-muted-foreground">
              generated from this period&rsquo;s data
            </span>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            {insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>

          <p className="text-[12px] leading-relaxed text-muted-foreground">
            These observations are produced by fixed rules over the numbers above, not by a
            language model. They state what changed and which segment accounted for it — they do
            not infer <em>why</em>, because Analytics records no deploys, content changes or
            algorithm updates that could support such a claim.
          </p>
        </div>
      )}

      <Card className="p-4 sm:p-5">
        <Tabs defaultValue="engagement">
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="engagement">Engagement</TabsTrigger>
            <TabsTrigger value="sources">Traffic sources</TabsTrigger>
            <TabsTrigger value="conversions">Conversions</TabsTrigger>
            <TabsTrigger value="journey">User journey</TabsTrigger>
            <TabsTrigger value="pages">Top &amp; worst pages</TabsTrigger>
            <TabsTrigger value="dropoff">Drop-off</TabsTrigger>
          </TabsList>

          <TabsContent value="engagement" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Engagement rate"
                value={formatPercent(now.engagementRate, 1)}
                change={delta(now.engagementRate, before.engagementRate)}
              />
              <StatCard
                label="Bounce rate"
                value={formatPercent(now.bounceRate, 1)}
                change={delta(now.bounceRate, before.bounceRate)}
                lowerIsBetter
              />
              <StatCard
                label="Views / session"
                value={now.viewsPerSession.toFixed(1)}
                change={delta(now.viewsPerSession, before.viewsPerSession)}
              />
              <StatCard
                label="Sessions / user"
                value={now.sessionsPerUser.toFixed(2)}
                change={delta(now.sessionsPerUser, before.sessionsPerUser)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Users" value={formatCompact(now.users)} change={delta(now.users, before.users)} />
              <StatCard label="Sessions" value={formatCompact(now.sessions)} change={delta(now.sessions, before.sessions)} />
              <StatCard
                label="Engaged sessions"
                value={formatCompact(now.engagedSessions)}
                change={delta(now.engagedSessions, before.engagedSessions)}
              />
              <StatCard
                label="Total engaged time"
                value={formatDuration(Math.round(now.engagementDuration))}
                change={delta(now.engagementDuration, before.engagementDuration)}
              />
            </div>

            <AudienceSplit rows={data.audience} />
          </TabsContent>

          <TabsContent value="sources" className="space-y-6">
            <div className="space-y-3">
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight">Channels</h3>
                <p className="text-[13px] text-muted-foreground">
                  Sessions by default channel group.
                </p>
              </div>
              <AcquisitionTable rows={data.channels} />
            </div>
            <div className="space-y-3">
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight">Source / medium</h3>
                <p className="text-[13px] text-muted-foreground">
                  The specific referrer behind each channel.
                </p>
              </div>
              <AcquisitionTable rows={data.sources} searchable />
            </div>
          </TabsContent>

          <TabsContent value="conversions">
            <ConversionsPanel conversions={data.conversions} />
          </TabsContent>

          <TabsContent value="journey">
            <JourneyFunnel stages={data.journey} />
          </TabsContent>

          <TabsContent value="pages" className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-3">
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight">Top performing pages</h3>
                <p className="text-[13px] text-muted-foreground">
                  Ranked by engagement quality, not traffic volume.
                </p>
              </div>
              <PagePerformanceTable rows={data.pages} variant="top" />
            </div>
            <div className="space-y-3">
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight">Worst performing pages</h3>
                <p className="text-[13px] text-muted-foreground">
                  Pages with real traffic that fail to hold it.
                </p>
              </div>
              <PagePerformanceTable rows={data.pages} variant="worst" />
            </div>
          </TabsContent>

          <TabsContent value="dropoff">
            <DropOffTable rows={data.dropOff} />
          </TabsContent>
        </Tabs>
      </Card>
    </section>
  );
}
