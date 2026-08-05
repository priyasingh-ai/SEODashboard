"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useFilters } from "@/hooks/use-filters";
import { usePageActions } from "@/hooks/use-page-actions";
import { downloadCSV, downloadPDF } from "@/lib/export";
import { formatRange } from "@/lib/date-range";
import { findWebsite } from "@/lib/websites";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-config";
import { SidebarBrand, SidebarNav } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

function MobileNav() {
  const [open, setOpen] = React.useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation">
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-14 items-center px-3">
          <SidebarBrand onNavigate={() => setOpen(false)} />
        </div>
        <div className="flex flex-1 flex-col py-2">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Portfolio › The Doc Mirror › Keywords */
function Breadcrumb() {
  const pathname = usePathname();
  const { siteId } = useFilters();
  const site = findWebsite(siteId);

  const section = NAV_ITEMS.find(
    (item) => item.href !== "/" && pathname.startsWith(item.href),
  );
  const onSitePage = pathname.startsWith("/site/");
  const showSite = onSitePage || !!section?.scoped;

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
      <Link
        href="/"
        className={cn(
          "shrink-0 transition-colors hover:text-foreground",
          showSite || section ? "text-muted-foreground" : "font-medium text-foreground",
        )}
      >
        Portfolio
      </Link>

      {showSite && site && (
        <>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <Link
            href={`/site/${site.id}`}
            className={cn(
              "min-w-0 truncate transition-colors hover:text-foreground",
              onSitePage ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {site.name}
          </Link>
        </>
      )}

      {section && (
        <>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <span className="truncate font-medium">{section.label}</span>
        </>
      )}
    </nav>
  );
}

function ExportMenu() {
  const { getExport } = usePageActions();
  const [busy, setBusy] = React.useState(false);
  const disabled = !getExport || busy;

  const onCSV = React.useCallback(() => {
    const payload = getExport?.();
    if (!payload?.sections.length) return;
    // CSV is a single flat table — the first section is the page's primary one.
    const [primary] = payload.sections;
    downloadCSV(primary.rows, primary.columns, payload.filename);
  }, [getExport]);

  const onPDF = React.useCallback(async () => {
    const payload = getExport?.();
    if (!payload?.sections.length) return;
    setBusy(true);
    try {
      await downloadPDF(
        payload.filename,
        { title: payload.title, subtitle: payload.subtitle },
        payload.sections,
      );
    } finally {
      setBusy(false);
    }
  }, [getExport]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="hidden sm:inline-flex">
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onCSV}>
          <FileSpreadsheet className="h-4 w-4" />
          Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPDF}>
          <FileText className="h-4 w-4" />
          Export PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RefreshButton() {
  const { refresh } = usePageActions();
  const [spinning, setSpinning] = React.useState(false);

  const onClick = React.useCallback(() => {
    if (!refresh) return;
    refresh();
    // The mock layer answers in ~120ms, which would make the spinner flash and
    // read as "nothing happened". Hold it for one full rotation.
    setSpinning(true);
    setTimeout(() => setSpinning(false), 600);
  }, [refresh]);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      disabled={!refresh}
      aria-label="Refresh data"
    >
      <RefreshCw className={cn("h-4 w-4 transition-transform", spinning && "animate-spin")} />
    </Button>
  );
}

function ProfileMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Account menu"
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary text-[10px] text-primary-foreground">
              AS
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <div className="text-[13px] font-medium text-foreground">Apps</div>
          <div className="truncate text-[11px] font-normal text-muted-foreground">
            apps@nextdot.co.in
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <User className="h-4 w-4" />
            Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The top bar. Sticky, so Refresh and Export stay reachable no matter how far
 * down a table you've scrolled.
 */
export function Navbar() {
  const { dateRange } = useFilters();

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
      <MobileNav />
      <div className="min-w-0 flex-1">
        <Breadcrumb />
      </div>

      <span className="hidden text-[11px] text-muted-foreground tabular xl:block">
        {formatRange(dateRange)}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        <RefreshButton />
        <ExportMenu />
        <ThemeToggle />
        <div className="mx-1 h-5 w-px bg-border" />
        <ProfileMenu />
      </div>
    </header>
  );
}
