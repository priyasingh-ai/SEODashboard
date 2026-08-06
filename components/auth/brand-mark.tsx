import { Radar } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The product mark, at the size the login card needs.
 *
 * Same glyph, same rounded square, same primary fill as `SidebarBrand` — one
 * step larger, because on the login screen it is the only thing identifying the
 * product rather than one item in a row of navigation. Kept here rather than
 * parameterising the sidebar's version, which is a link and carries navigation
 * behaviour this has no use for.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-card",
        className,
      )}
    >
      <Radar className="h-5 w-5" strokeWidth={2.25} />
    </span>
  );
}
