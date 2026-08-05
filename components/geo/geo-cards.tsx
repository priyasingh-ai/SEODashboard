"use client";

import { Bot, CheckCircle2, CircleSlash, Key, MinusCircle, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import { Card } from "@/components/ui/card";
import type { GeoScore, GeoSignal, ProviderResult, SignalStatus } from "@/lib/geo/types";

/**
 * GEO display components.
 *
 * Visual language is deliberately identical to the Technical SEO and Content
 * Health modules: the same status palette, the same card shape, the same
 * "unmeasured is grey, never green" rule.
 */

const STATUS: Record<SignalStatus, { label: string; icon: LucideIcon; tone: string }> = {
  good: {
    label: "Good",
    icon: CheckCircle2,
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  partial: {
    label: "Partial",
    icon: MinusCircle,
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  poor: {
    label: "Missing",
    icon: XCircle,
    tone: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
  "not-configured": {
    label: "Not configured",
    icon: Key,
    tone: "bg-secondary text-muted-foreground",
  },
  unavailable: {
    label: "Not available",
    icon: CircleSlash,
    tone: "bg-secondary text-muted-foreground",
  },
};

export function StatusBadge({ status, className }: { status: SignalStatus; className?: string }) {
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

/* -------------------------------------------------------------------------- */
/*  Scores                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A score card.
 *
 * When `value` is undefined the card shows "Not measured" rather than 0 — the
 * distinction between "we looked and found nothing" and "we could not look" is
 * the whole point of this module.
 */
export function ScoreCard({ score, className }: { score: GeoScore; className?: string }) {
  const measured = typeof score.value === "number";
  const tone = !measured
    ? "text-muted-foreground"
    : score.value! >= 70
      ? "text-emerald-600 dark:text-emerald-400"
      : score.value! >= 40
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <Card className={cn("p-4", className)}>
      <div className="text-[11px] font-medium text-muted-foreground">{score.label}</div>
      <div className={cn("mt-0.5 text-2xl font-semibold tracking-tight tabular", tone)}>
        {measured ? score.value : "—"}
        {measured && <span className="text-sm text-muted-foreground">/100</span>}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">
        {measured
          ? `${score.measured} of ${score.total} signals measured`
          : `Not measured · 0 of ${score.total} signals available`}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Providers                                                                  */
/* -------------------------------------------------------------------------- */

export function ProviderCard({ result, className }: { result: ProviderResult; className?: string }) {
  const ok = result.status === "ok";
  const runs = result.probes.length;
  const prompts = new Set(result.probes.map((p) => p.sourceQuery)).size;

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
          <span className="text-[13px] font-semibold tracking-tight">{result.label}</span>
        </div>
        <StatusBadge
          status={
            result.status === "ok"
              ? result.mentionRate > 0
                ? "good"
                : "poor"
              : result.status === "error"
                ? "unavailable"
                : "not-configured"
          }
        />
      </div>

      {ok ? (
        <>
          <div className="mt-2 flex items-baseline gap-3">
            <div>
              <div className="text-xl font-semibold tracking-tight tabular">
                {formatPercent(result.mentionRate, 0)}
              </div>
              <div className="text-[11px] text-muted-foreground">mention rate</div>
            </div>
            <div>
              <div className="text-[13px] font-medium tabular">
                {formatPercent(result.citationRate, 0)}
              </div>
              <div className="text-[11px] text-muted-foreground">cited</div>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {runs} runs across {prompts} category {prompts === 1 ? "prompt" : "prompts"} ·{" "}
            {result.model}
          </p>
        </>
      ) : (
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{result.reason}</p>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Signals                                                                    */
/* -------------------------------------------------------------------------- */

export function SignalCard({ signal, className }: { signal: GeoSignal; className?: string }) {
  const ring =
    signal.status === "poor"
      ? "border-red-200/70 dark:border-red-500/20"
      : signal.status === "partial"
        ? "border-amber-200/70 dark:border-amber-500/20"
        : "border-border";

  return (
    <Card className={cn("p-4", ring, className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold tracking-tight">{signal.label}</span>
        <StatusBadge status={signal.status} />
      </div>

      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{signal.summary}</p>

      {signal.evidence.length > 0 && (
        <dl className="mt-2.5 grid grid-cols-3 gap-2 rounded-lg border border-border p-2.5">
          {signal.evidence.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="truncate text-[11px] text-muted-foreground">{item.label}</dt>
              <dd className="truncate text-[12px] font-medium" title={item.value}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {signal.reason && (
        <p className="mt-2.5 rounded-lg border border-border bg-secondary/40 p-2.5 text-[12px] leading-relaxed text-muted-foreground">
          {signal.reason}
        </p>
      )}
    </Card>
  );
}
