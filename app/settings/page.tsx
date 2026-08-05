"use client";

import { BarChart3, Check, Search } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { ACTIVE_WEBSITES } from "@/lib/websites";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * Settings — connected properties and appearance.
 *
 * The property list comes from `lib/websites.ts`, but sync freshness is runtime
 * state, so it's read through the service layer like every other number in the
 * app rather than being baked into the config.
 */
export default function SettingsPage() {
  const { data } = useAsync("websites", () => api.listWebsites());
  const syncedAt = new Map((data?.sites ?? []).map((s) => [s.id, s.lastSync]));
  const isLive = data?.source === "google";

  return (
    <div className="mx-auto max-w-[900px] space-y-8">
      <PageHeader
        title="Settings"
        description="Connected properties and dashboard preferences."
      />

      <section className="space-y-3">
        <SectionHeader
          title="Connected properties"
          description="Each site pairs one Search Console property with one GA4 stream."
        />
        <Card className="divide-y divide-border">
          {ACTIVE_WEBSITES.map((site) => (
            <div key={site.id} className="flex flex-wrap items-center gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-xs font-semibold">
                {site.initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{site.name}</div>
                <div className="truncate text-[13px] text-muted-foreground">{site.domain}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="gap-1">
                  <Search className="h-3 w-3" />
                  GSC
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <BarChart3 className="h-3 w-3" />
                  GA4
                </Badge>
              </div>
              <div className="hidden w-28 shrink-0 text-right text-[11px] text-muted-foreground tabular sm:block">
                {syncedAt.has(site.id) ? (
                  `Synced ${formatRelativeTime(syncedAt.get(site.id)!, new Date().toISOString())}`
                ) : (
                  <Skeleton className="ml-auto h-3 w-20" />
                )}
              </div>
              <Badge className="gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                <Check className="h-3 w-3" strokeWidth={3} />
                Connected
              </Badge>
            </div>
          ))}
        </Card>
        <p className="text-[13px] text-muted-foreground">
          Properties are configured in{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[12px]">lib/websites.ts</code>. Set{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[12px]">DATA_SOURCE=google</code> with
          service-account credentials to read live data.
        </p>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Appearance" description="Applies to this browser only." />
        <Card className="flex items-center justify-between gap-4 p-4">
          <div>
            <div className="text-sm font-medium">Theme</div>
            <div className="text-[13px] text-muted-foreground">
              Light, dark, or match your system.
            </div>
          </div>
          <ThemeToggle />
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Data" description="Where the numbers come from." />
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Source</div>
              <div className="text-[13px] text-muted-foreground">
                {isLive
                  ? "Google Analytics 4 + Search Console APIs"
                  : "Service layer · provider selected by DATA_SOURCE"}
              </div>
            </div>
            <Badge variant="outline">{isLive ? "Live" : "Mock"}</Badge>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
            <div>
              <div className="text-sm font-medium">Google Search Console API</div>
              <div className="text-[13px] text-muted-foreground">
                {isLive ? "Connected" : "Not connected"}
              </div>
            </div>
            <Badge variant="outline">{isLive ? "OK" : "Off"}</Badge>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
            <div>
              <div className="text-sm font-medium">Google Analytics 4 Data API</div>
              <div className="text-[13px] text-muted-foreground">
                {isLive ? "Connected" : "Not connected"}
              </div>
            </div>
            <Badge variant="outline">{isLive ? "OK" : "Off"}</Badge>
          </div>
        </Card>
      </section>
    </div>
  );
}
