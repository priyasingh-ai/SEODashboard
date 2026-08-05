import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDelta } from "@/lib/format";
import { deltaSentiment } from "@/lib/metrics";

interface TrendBadgeProps {
  /** Signed fractional change. 0.12 === +12%. */
  change: number;
  /** Set for Average Position, where a fall in rank is an improvement. */
  lowerIsBetter?: boolean;
  size?: "sm" | "md";
  /** Render just the arrow + number, without the tinted pill. */
  bare?: boolean;
  className?: string;
}

/**
 * The delta chip.
 *
 * Direction and sentiment are separate on purpose: the arrow always points the
 * way the *number* moved, while the color says whether that's good. For average
 * position those disagree — rank 12 → 8 is an arrow down and a win.
 *
 * The arrow is the secondary encoding, so the meaning never rests on color alone.
 */
export function TrendBadge({
  change,
  lowerIsBetter = false,
  size = "sm",
  bare = false,
  className,
}: TrendBadgeProps) {
  const sentiment = deltaSentiment(change, lowerIsBetter);
  const Icon = sentiment === "neutral" ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;

  const tone = {
    positive: bare
      ? "text-emerald-700 dark:text-emerald-400"
      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    negative: bare
      ? "text-red-700 dark:text-red-400"
      : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    neutral: bare
      ? "text-muted-foreground"
      : "bg-secondary text-muted-foreground",
  }[sentiment];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium tabular",
        !bare && "rounded-md px-1.5 py-0.5",
        size === "sm" ? "text-[11px] leading-4" : "text-xs leading-5",
        tone,
        className,
      )}
      title={`${formatDelta(change)} vs. previous period`}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={2.5} />
      {sentiment === "neutral" ? "0%" : formatDelta(Math.abs(change) > 0 ? change : 0)}
    </span>
  );
}
