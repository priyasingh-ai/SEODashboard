import {
  ArrowDownRight,
  FileText,
  MousePointerClick,
  Search,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { ActionCategory, ActionItem } from "@/lib/actions";
import { PriorityBadge } from "./priority-badge";
import { OpportunityBadge } from "./opportunity-badge";
import { RecommendationPanel } from "./recommendation-panel";

/**
 * One finding, in the order a reader actually needs it:
 * what is wrong → why it matters → the numbers behind it → what to do.
 *
 * The card is presentational only. Every judgement it renders — priority,
 * impact, score — was made in `lib/actions`, so the same finding shown in a
 * different surface cannot disagree with this one.
 */

const CATEGORY_META: Record<ActionCategory, { icon: LucideIcon; label: string }> = {
  "losing-impressions": { icon: TrendingDown, label: "Losing impressions" },
  "position-drop": { icon: ArrowDownRight, label: "Ranking drop" },
  "ctr-gap": { icon: MousePointerClick, label: "Low click-through" },
  "striking-distance": { icon: Target, label: "Striking distance" },
  "no-clicks": { icon: Search, label: "No clicks" },
  "new-keyword": { icon: Sparkles, label: "New keyword" },
  "rising-query": { icon: TrendingUp, label: "Rising query" },
  "not-indexed": { icon: FileText, label: "Not indexed" },
};

export function ActionCard({ action, className }: { action: ActionItem; className?: string }) {
  const meta = CATEGORY_META[action.category];
  const Icon = meta.icon;

  return (
    <Card className={cn("flex flex-col gap-3 p-5", className)}>
      {/* Header: what kind of finding, how urgent, how big */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium">{meta.label}</div>
            <div className="truncate text-[11px] text-muted-foreground" title={action.subject}>
              {action.subjectKind === "page" ? "Page" : "Keyword"} · {action.subject}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <PriorityBadge priority={action.priority} />
          <OpportunityBadge score={action.opportunityScore} />
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Problem
          </div>
          <p className="mt-0.5 text-[13px] leading-relaxed">{action.problem}</p>
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Why this matters
          </div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
            {action.whyItMatters}
          </p>
        </div>
      </div>

      {/* The numbers the claim rests on — so it can be checked, not just trusted */}
      <dl className="grid grid-cols-3 gap-2 rounded-lg border border-border p-2.5">
        {action.evidence.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="truncate text-[11px] text-muted-foreground">{item.label}</dt>
            <dd
              className={cn(
                "truncate text-[12px] font-medium tabular",
                item.tone === "negative" && "text-red-600 dark:text-red-400",
                item.tone === "positive" && "text-emerald-600 dark:text-emerald-400",
              )}
              title={item.value}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <RecommendationPanel
        className="mt-auto"
        recommendedAction={action.recommendedAction}
        impact={action.impact}
        estimatedClicks={action.estimatedClicks}
      />
    </Card>
  );
}

export { CATEGORY_META };
