import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Compact variant for use inside a table body or a chart card. */
  inset?: boolean;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  inset = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        inset ? "gap-2 px-6 py-10" : "gap-3 px-6 py-16",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground",
          inset ? "h-9 w-9" : "h-11 w-11",
        )}
      >
        <Icon className={inset ? "h-4 w-4" : "h-5 w-5"} strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <p className={cn("font-medium", inset ? "text-[13px]" : "text-sm")}>{title}</p>
        {description && (
          <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
