import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { IMPACT_LABEL, PRIORITY_LABEL, type Impact, type Priority } from "@/lib/actions";

/**
 * Priority and impact chips.
 *
 * Colour is never the only channel: each chip carries its own word ("High",
 * "Very High"), so the priority is legible without relying on red-vs-amber
 * discrimination. Both palettes are declared for light and dark explicitly,
 * matching the connected-property badge in Settings.
 */

const priorityVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4",
  {
    variants: {
      priority: {
        high: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
        medium: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
        low: "bg-secondary text-muted-foreground",
      },
    },
    defaultVariants: { priority: "low" },
  },
);

const DOT: Record<Priority, string> = {
  high: "bg-red-500 dark:bg-red-400",
  medium: "bg-amber-500 dark:bg-amber-400",
  low: "bg-muted-foreground/50",
};

interface PriorityBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof priorityVariants> {
  priority: Priority;
  /** Hide the leading dot when the chip sits inside a dense row. */
  showDot?: boolean;
}

export function PriorityBadge({
  priority,
  showDot = true,
  className,
  ...props
}: PriorityBadgeProps) {
  return (
    <span className={cn(priorityVariants({ priority }), className)} {...props}>
      {showDot && (
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[priority])} aria-hidden />
      )}
      {PRIORITY_LABEL[priority]} priority
    </span>
  );
}

/** Estimated SEO impact — the four-tier scale, rendered as a quiet chip. */
export function ImpactBadge({
  impact,
  className,
  ...props
}: { impact: Impact } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground",
        className,
      )}
      {...props}
    >
      {IMPACT_LABEL[impact]} impact
    </span>
  );
}
