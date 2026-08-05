"use client";

import * as React from "react";
import { Layers, Zap } from "lucide-react";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EFFORT_LABEL, HORIZON_DESCRIPTION, HORIZON_LABEL, SOURCE_LABEL } from "@/lib/copilot";
import type { CopilotTask, Horizon } from "@/lib/copilot";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PriorityBadge } from "@/components/actions/priority-badge";
import { EmptyState } from "@/components/dashboard/empty-state";

/**
 * One horizon's worth of work.
 *
 * Reused verbatim for Today, This Week and This Month — the three lists differ
 * only in what was scheduled into them, so they must not differ in how they
 * read. A separate component per horizon would drift, and the drift would
 * silently imply the lists carry different kinds of authority.
 */

const EFFORT_TONE: Record<CopilotTask["effort"], string> = {
  quick: "text-emerald-700 dark:text-emerald-400",
  moderate: "text-amber-700 dark:text-amber-400",
  project: "text-muted-foreground",
};

export function TaskList({
  horizon,
  tasks,
  className,
}: {
  horizon: Horizon;
  tasks: CopilotTask[];
  className?: string;
}) {
  const total = tasks.reduce((sum, t) => sum + (t.estimatedClicks ?? 0), 0);

  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-[15px] font-semibold">{HORIZON_LABEL[horizon]}</h3>
          <span className="text-[12px] text-muted-foreground">
            {tasks.length} {tasks.length === 1 ? "item" : "items"}
            {total >= 1 && ` · ~${formatCompact(Math.round(total))} clicks modelled`}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
          {HORIZON_DESCRIPTION[horizon]}
        </p>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          inset
          title="Nothing scheduled"
          description={
            horizon === "today"
              ? "No quick, high-value fix is outstanding — which is a good state, not a missing feature."
              : "No finding in this window met the bar for this horizon."
          }
        />
      ) : (
        <ol className="space-y-2">
          {tasks.map((task, i) => (
            <li key={task.id}>
              <Card className="p-3.5">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-secondary text-[11px] font-semibold tabular text-muted-foreground"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    {/*
                      The subject leads, not the recommendation.

                      Recommendations are written per rule, so six CTR findings
                      produce six identical "Rewrite the title tag…" lines. On an
                      Action Center card that reads fine because the subject sits
                      beside it; in a flat list it makes the plan unscannable and
                      looks like a rendering bug. Naming the page or keyword first
                      is what makes each row a different piece of work.
                    */}
                    {!task.isProgramme && (
                      <p className="truncate text-[13px] font-semibold" title={task.subject}>
                        {task.subjectKind === "keyword" ? `"${task.subject}"` : task.subject}
                      </p>
                    )}
                    <p
                      className={cn(
                        "text-[13px] leading-relaxed",
                        task.isProgramme ? "font-medium" : "mt-1 text-muted-foreground",
                      )}
                    >
                      {task.title}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {task.why}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <PriorityBadge priority={task.priority} />
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[11px] font-medium",
                          EFFORT_TONE[task.effort],
                        )}
                      >
                        {task.effort === "project" ? (
                          <Layers className="h-3 w-3" strokeWidth={2} />
                        ) : (
                          <Zap className="h-3 w-3" strokeWidth={2} />
                        )}
                        {EFFORT_LABEL[task.effort]}
                      </span>
                      {task.estimatedClicks !== undefined && task.estimatedClicks >= 1 && (
                        <Badge variant="outline">
                          ~{formatCompact(Math.round(task.estimatedClicks))} clicks
                        </Badge>
                      )}
                      {task.isProgramme && <Badge variant="outline">{task.subject}</Badge>}
                      <span className="text-[11px] text-muted-foreground">
                        {SOURCE_LABEL[task.source]}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
