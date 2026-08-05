"use client";

import { motion } from "framer-motion";
import type { MetricKey, MetricValue } from "@/types";
import { METRICS } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/charts/sparkline";
import { TrendBadge } from "./trend-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MetricCardProps {
  metricKey: MetricKey;
  value: MetricValue;
  /** Hide the previous-period row when the compare toggle is off. */
  compare?: boolean;
  /** Stagger index for the mount animation. */
  index?: number;
  className?: string;
}

/**
 * The overview card: one measure, its previous-period counterpart, the delta,
 * and a sparkline for shape.
 *
 * The value carries proportional figures (it's a hero number, not a column);
 * the previous-period line is tabular so the cards line up down the grid.
 */
export function MetricCard({
  metricKey,
  value,
  compare = true,
  index = 0,
  className,
}: MetricCardProps) {
  const def = METRICS[metricKey];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.28,
        // Cap the stagger so the last card in a 10-card grid isn't half a second late.
        delay: Math.min(index * 0.03, 0.24),
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn(
        "group relative flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-[13px] font-medium text-muted-foreground decoration-dotted underline-offset-4 hover:underline">
              {def.label}
            </span>
          </TooltipTrigger>
          <TooltipContent>{def.hint}</TooltipContent>
        </Tooltip>
        <TrendBadge change={value.change} lowerIsBetter={def.lowerIsBetter} />
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-2xl font-semibold tracking-tight">
            {def.format(value.current)}
          </div>
          {compare && (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground tabular">
              from {def.format(value.previous)}
            </div>
          )}
        </div>
        <div className="w-20 shrink-0 sm:w-24">
          <Sparkline data={value.spark} />
        </div>
      </div>
    </motion.div>
  );
}
