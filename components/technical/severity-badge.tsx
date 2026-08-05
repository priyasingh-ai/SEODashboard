import { AlertTriangle, CircleHelp, CircleSlash, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CheckStatus, ImpactLevel, Severity } from "@/lib/technical/types";

/**
 * Red / yellow / green, plus the two states that are neither.
 *
 * A check that could not run is deliberately grey rather than green. Green is a
 * claim that something was verified, and applying it to an unmeasured check
 * would be the most misleading thing this module could do.
 *
 * Every chip carries its own word, so the status never rests on colour alone.
 */

const STATUS: Record<CheckStatus, { label: string; icon: LucideIcon; tone: string; dot: string }> = {
  critical: {
    label: "Critical",
    icon: AlertTriangle,
    tone: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    dot: "bg-red-500 dark:bg-red-400",
  },
  warning: {
    label: "Needs attention",
    icon: AlertTriangle,
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    dot: "bg-amber-500 dark:bg-amber-400",
  },
  healthy: {
    label: "Healthy",
    icon: ShieldCheck,
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    dot: "bg-emerald-500 dark:bg-emerald-400",
  },
  unavailable: {
    label: "Not available",
    icon: CircleSlash,
    tone: "bg-secondary text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
  "not-configured": {
    label: "Not configured",
    icon: CircleHelp,
    tone: "bg-secondary text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
};

export function SeverityBadge({
  status,
  className,
}: {
  status: CheckStatus;
  className?: string;
}) {
  const { label, icon: Icon, tone } = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4",
        tone,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2.25} />
      {label}
    </span>
  );
}

export function StatusDot({ status, className }: { status: CheckStatus; className?: string }) {
  return (
    <span
      className={cn("h-2 w-2 shrink-0 rounded-full", STATUS[status].dot, className)}
      aria-hidden
    />
  );
}

const IMPACT_LABEL: Record<ImpactLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  "very-high": "Very High",
};

export function ImpactBadge({ impact, className }: { impact: ImpactLevel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground",
        className,
      )}
    >
      {IMPACT_LABEL[impact]} impact
    </span>
  );
}

export { STATUS as STATUS_META, IMPACT_LABEL };

/** Border tint so a card's severity reads before any text is parsed. */
export function severityRing(status: CheckStatus): string {
  return status === "critical"
    ? "border-red-200/70 dark:border-red-500/20"
    : status === "warning"
      ? "border-amber-200/70 dark:border-amber-500/20"
      : "border-border";
}

export type { Severity };
