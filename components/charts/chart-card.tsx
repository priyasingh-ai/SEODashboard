import * as React from "react";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  /** Legend, range chips, or a source badge — rendered top-right. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * The shell every chart sits in — title block, optional action slot, and a
 * padded plot area. Having one shell is what makes eight charts read as one
 * system instead of eight one-offs.
 */
export function ChartCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: ChartCardProps) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-xl border border-border bg-card shadow-card",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4 px-5 pb-4 pt-5">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-sm font-semibold tracking-tight">{title}</h3>
          {description && (
            <p className="truncate text-[13px] text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={cn("flex-1 px-2 pb-4 pr-4", contentClassName)}>{children}</div>
    </section>
  );
}

/**
 * The legend. Present whenever a chart draws two or more series, so identity is
 * never carried by color alone.
 */
export function ChartLegend({
  items,
  className,
}: {
  items: { label: string; color: string; dashed?: boolean }[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            aria-hidden
            className="h-0.5 w-3 shrink-0 rounded-full"
            style={
              item.dashed
                ? {
                    // A dashed rule reads as "previous period" without spending a hue.
                    backgroundImage: `repeating-linear-gradient(to right, ${item.color} 0 3px, transparent 3px 5px)`,
                  }
                : { backgroundColor: item.color }
            }
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
