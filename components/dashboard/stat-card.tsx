import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TrendBadge } from "./trend-badge";

interface StatCardProps {
  label: string;
  value: string;
  /** Optional supporting line under the value. */
  sub?: string;
  change?: number;
  lowerIsBetter?: boolean;
  icon?: LucideIcon;
  className?: string;
}

/**
 * A compact single-number tile.
 *
 * Where MetricCard is the full treatment (sparkline, previous period),
 * StatCard is the terse one — used for the GA4 stat row and the portfolio
 * highlights, where the number *is* the whole story and a chart would be noise.
 */
export function StatCard({
  label,
  value,
  sub,
  change,
  lowerIsBetter,
  icon: Icon,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-card",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />}
        <span className="truncate text-[13px] font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-xl font-semibold tracking-tight">{value}</span>
        {change !== undefined && <TrendBadge change={change} lowerIsBetter={lowerIsBetter} />}
      </div>
      {sub && <span className="text-[11px] text-muted-foreground tabular">{sub}</span>}
    </div>
  );
}
