"use client";

import * as React from "react";
import { ChevronDown, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { CheckResult, TechnicalIssue } from "@/lib/technical/types";
import { ImpactBadge, SeverityBadge, severityRing } from "./severity-badge";

/**
 * One technical check, collapsed to its verdict and expandable to its issues.
 *
 * Collapsed by default because a healthy audit is ten green rows nobody needs
 * to read, and the point of the page is to surface the two that are not.
 * Anything failing opens on mount.
 */
export function CheckCard({ check, className }: { check: CheckResult; className?: string }) {
  const failing = check.status === "critical" || check.status === "warning";
  const [open, setOpen] = React.useState(failing);
  const panelId = `check-${check.check}`;

  const hasBody = check.issues.length > 0 || Boolean(check.unavailableReason);

  return (
    <Card className={cn("overflow-hidden", severityRing(check.status), className)}>
      <button
        type="button"
        onClick={() => hasBody && setOpen((v) => !v)}
        aria-expanded={hasBody ? open : undefined}
        aria-controls={hasBody ? panelId : undefined}
        disabled={!hasBody}
        className={cn(
          "flex w-full items-start gap-3 p-4 text-left transition-colors",
          hasBody && "hover:bg-secondary/40",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold tracking-tight">{check.label}</span>
            <SeverityBadge status={check.status} />
            {check.checkedPages > 0 && (
              <span className="text-[11px] text-muted-foreground tabular">
                {check.checkedPages} checked
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
            {check.summary}
          </p>
        </div>

        {hasBody && (
          <ChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            strokeWidth={2}
          />
        )}
      </button>

      {open && hasBody && (
        <div id={panelId} className="space-y-3 border-t border-border p-4">
          {check.unavailableReason && check.issues.length === 0 && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {check.unavailableReason}
            </p>
          )}
          {check.issues.map((issue) => (
            <IssueBlock key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </Card>
  );
}

function IssueBlock({ issue }: { issue: TechnicalIssue }) {
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? issue.affectedPages : issue.affectedPages.slice(0, 4);
  // The list is capped server-side, so it can be shorter than the true count.
  const hidden = issue.affectedCount - issue.affectedPages.length;

  return (
    <div className={cn("rounded-lg border p-3", severityRing(issue.severity))}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge status={issue.severity} />
        <span className="text-[13px] font-medium">{issue.title}</span>
      </div>

      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {issue.description}
      </p>

      {issue.affectedPages.length > 0 && (
        <div className="mt-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Affected {issue.affectedCount === 1 ? "page" : `pages · ${issue.affectedCount}`}
          </div>
          <ul className="mt-1 space-y-0.5">
            {visible.map((page) => (
              <li
                key={page}
                className="truncate font-mono text-[11px] text-muted-foreground"
                title={page}
              >
                {page}
              </li>
            ))}
          </ul>
          {issue.affectedPages.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-1 text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {showAll ? "Show fewer" : `Show all ${issue.affectedPages.length}`}
            </button>
          )}
          {hidden > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              …and {hidden} more not listed.
            </p>
          )}
        </div>
      )}

      <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-2.5">
        <div className="flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Suggested fix
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed">{issue.suggestedFix}</p>
        <div className="mt-2 border-t border-border pt-2">
          <ImpactBadge impact={issue.estimatedImpact} />
        </div>
      </div>
    </div>
  );
}
