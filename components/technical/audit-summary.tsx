"use client";

import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { TechnicalAudit } from "@/lib/technical/types";
import { StatusDot } from "./severity-badge";

/**
 * The audit headline: one score, three counts, and the checks as a strip.
 *
 * The score excludes checks that could not run, and the card says how many
 * those were — a 100 built on four measured checks out of ten is not the same
 * result as a 100 built on all ten, and hiding the difference would flatter the
 * site at the reader's expense.
 */
export function AuditSummary({
  audit,
  className,
}: {
  audit: TechnicalAudit;
  className?: string;
}) {
  const unmeasured = audit.checks.filter(
    (c) => c.status === "unavailable" || c.status === "not-configured",
  ).length;
  const measured = audit.checks.length - unmeasured;

  const tone =
    audit.score >= 85
      ? "text-emerald-600 dark:text-emerald-400"
      : audit.score >= 60
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex flex-wrap items-center gap-6 border-b border-border p-5">
        <div>
          <div className={cn("text-3xl font-semibold tracking-tight tabular", tone)}>
            {audit.score}
            <span className="text-base text-muted-foreground">/100</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            across {measured} measured check{measured === 1 ? "" : "s"}
            {unmeasured > 0 && ` · ${unmeasured} unavailable`}
          </div>
        </div>

        <dl className="flex flex-wrap items-center gap-5">
          <Count label="Critical" value={audit.counts.critical} status="critical" />
          <Count label="Warnings" value={audit.counts.warning} status="warning" />
          <Count label="Passing" value={audit.counts.healthy} status="healthy" />
        </dl>

        <div className="ml-auto text-right">
          <div className="text-[11px] text-muted-foreground">
            {audit.pagesScanned} page{audit.pagesScanned === 1 ? "" : "s"} scanned
          </div>
          <div className="text-[11px] text-muted-foreground">
            {formatRelativeTime(audit.scannedAt, new Date().toISOString())}
          </div>
        </div>
      </div>

      {/* Every check at a glance, so an unread section is still visible */}
      <ul className="flex flex-wrap gap-x-4 gap-y-2 p-4">
        {audit.checks.map((check) => (
          <li key={check.check} className="flex items-center gap-1.5">
            <StatusDot status={check.status} />
            <span className="text-[12px] text-muted-foreground">{check.label}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Count({
  label,
  value,
  status,
}: {
  label: string;
  value: number;
  status: "critical" | "warning" | "healthy";
}) {
  return (
    <div className="flex items-center gap-2">
      <StatusDot status={status} />
      <div>
        <dd className="text-base font-semibold leading-tight tabular">{value}</dd>
        <dt className="text-[11px] leading-tight text-muted-foreground">{label}</dt>
      </div>
    </div>
  );
}
