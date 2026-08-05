import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toStars } from "@/lib/actions";

/**
 * Opportunity score, as stars and as a number.
 *
 * Both are shown deliberately. Stars are scannable down a long column; the
 * number is what you need when two cards are close and you have to pick one.
 *
 * The score is relative to the site's own traffic, so it is comparable between
 * cards on this page and meaningless between sites. The page states that once,
 * near the summary, rather than repeating it on every card.
 */

interface OpportunityBadgeProps {
  /** 0–100. */
  score: number;
  /** Stars only, for dense rows. */
  compact?: boolean;
  className?: string;
}

export function OpportunityBadge({ score, compact = false, className }: OpportunityBadgeProps) {
  const stars = toStars(score);

  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      // The visual is decorative; this is what a screen reader announces.
      role="img"
      aria-label={`Opportunity score ${score} out of 100`}
    >
      <div className="flex items-center gap-px" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            className={cn(
              "h-3 w-3",
              i < stars ? "fill-amber-400 text-amber-400" : "text-border",
            )}
            strokeWidth={2}
          />
        ))}
      </div>
      {!compact && (
        <span className="text-[11px] font-medium text-muted-foreground tabular" aria-hidden>
          {score}/100
        </span>
      )}
    </div>
  );
}
