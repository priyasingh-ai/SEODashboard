"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Radar } from "lucide-react";
import { useFilters } from "@/hooks/use-filters";
import { cn } from "@/lib/utils";
import { ACTIVE_WEBSITES, DEFAULT_WEBSITE_ID } from "@/lib/websites";
import { NAV_ITEMS } from "./nav-config";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/site/");
  return pathname.startsWith(href);
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { siteId, range, compare } = useFilters();

  // Site-scoped links carry the current filters across, so switching sections
  // never silently resets the window you were looking at.
  const scopedQuery = React.useMemo(() => {
    const p = new URLSearchParams();
    if (siteId !== DEFAULT_WEBSITE_ID) p.set("site", siteId);
    if (range !== "28d") p.set("range", range);
    if (!compare) p.set("compare", "0");
    const qs = p.toString();
    return qs ? `?${qs}` : "";
  }, [siteId, range, compare]);

  const globalQuery = React.useMemo(() => {
    const p = new URLSearchParams();
    if (range !== "28d") p.set("range", range);
    if (!compare) p.set("compare", "0");
    const qs = p.toString();
    return qs ? `?${qs}` : "";
  }, [range, compare]);

  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Main">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const href = `${item.href}${item.scoped ? scopedQuery : item.href === "/settings" ? "" : globalQuery}`;

        return (
          <Link
            key={item.href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              // A shared layoutId slides the highlight between items instead of
              // popping — the one bit of motion the nav actually needs.
              <motion.span
                layoutId="sidebar-active"
                className="absolute inset-0 rounded-lg bg-secondary"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <item.icon
              className={cn(
                "relative z-10 h-4 w-4 shrink-0 transition-colors",
                active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
              )}
              strokeWidth={2}
            />
            <span className="relative z-10 truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarBrand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-lg px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Radar className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <span className="text-[13px] font-semibold tracking-tight">SEO Portfolio</span>
    </Link>
  );
}

/**
 * The desktop sidebar.
 *
 * Sticky and full-height: navigation should never scroll away from you. Hidden
 * below `lg`, where it's replaced by the sheet in `MobileNav`.
 */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-svh w-[224px] shrink-0 flex-col border-r border-border bg-card/50 lg:flex">
      <div className="flex h-14 items-center px-3">
        <SidebarBrand />
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto py-2 scrollbar-thin">
        <SidebarNav />
      </div>
      <div className="border-t border-border p-3">
        <p className="px-2.5 text-[11px] leading-relaxed text-muted-foreground">
          {ACTIVE_WEBSITES.length} properties connected
        </p>
      </div>
    </aside>
  );
}
