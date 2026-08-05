"use client";

import * as React from "react";
import { CalendarDays, Check, GitCompareArrows } from "lucide-react";
import type { DateRange as RdpRange } from "react-day-picker";
import type { RangeKey } from "@/types";
import {
  reportingAnchor,
  RANGE_LABELS,
  formatRange,
  parseISODate,
  toISODate,
} from "@/lib/date-range";
import { useFilters } from "@/hooks/use-filters";
import { ACTIVE_WEBSITES } from "@/lib/websites";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const PRESETS: Exclude<RangeKey, "custom">[] = ["7d", "28d", "3m", "12m"];

/** The presets, as a segmented control on desktop and a select on mobile. */
function RangePicker() {
  const { range, custom, dateRange, setRange } = useFilters();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<RdpRange | undefined>();

  // Seed the calendar with whatever window is currently applied.
  React.useEffect(() => {
    if (open) {
      setDraft({ from: parseISODate(dateRange.from), to: parseISODate(dateRange.to) });
    }
  }, [open, dateRange.from, dateRange.to]);

  const applyCustom = React.useCallback(() => {
    if (!draft?.from || !draft?.to) return;
    setRange("custom", { from: toISODate(draft.from), to: toISODate(draft.to) });
    setOpen(false);
  }, [draft, setRange]);

  return (
    <div className="flex items-center gap-2">
      {/* Desktop: segmented presets */}
      <div className="hidden items-center rounded-lg border border-border bg-card p-0.5 md:flex">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setRange(preset)}
            aria-pressed={range === preset}
            className={cn(
              "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
              range === preset
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {RANGE_LABELS[preset].replace("Last ", "")}
          </button>
        ))}
      </div>

      {/* Mobile: the same presets, collapsed into a select */}
      <Select
        value={range === "custom" ? "custom" : range}
        onValueChange={(v) => v !== "custom" && setRange(v as RangeKey)}
      >
        <SelectTrigger className="w-[136px] md:hidden" aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((preset) => (
            <SelectItem key={preset} value={preset}>
              {RANGE_LABELS[preset]}
            </SelectItem>
          ))}
          {range === "custom" && <SelectItem value="custom">Custom range</SelectItem>}
        </SelectContent>
      </Select>

      {/* Custom range, behind a hairline from the presets */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={range === "custom" ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            aria-label="Custom date range"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="hidden lg:inline tabular">
              {range === "custom" && custom ? formatRange(custom) : "Custom"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-2">
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={draft}
            onSelect={setDraft}
            defaultMonth={parseISODate(dateRange.from)}
            // No data exists past the anchor, so don't let anyone ask for it.
            disabled={{ after: parseISODate(reportingAnchor()) }}
          />
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2">
            <span className="pl-1 text-[11px] text-muted-foreground tabular">
              {draft?.from && draft?.to
                ? formatRange({ from: toISODate(draft.from), to: toISODate(draft.to) })
                : "Pick a start and end date"}
            </span>
            <Button size="sm" onClick={applyCustom} disabled={!draft?.from || !draft?.to}>
              <Check className="h-3.5 w-3.5" />
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * The sticky filter bar: which site, which window, and whether to compare.
 *
 * It sits directly under the header and stays put on scroll — these three
 * controls define what every number on the page means, so they should never
 * scroll out of reach.
 */
export function FilterBar() {
  const { siteId, compare, setSite, setCompare } = useFilters();

  return (
    <div className="no-print sticky top-14 z-20 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
        <Select value={siteId} onValueChange={setSite}>
          <SelectTrigger className="w-[168px] shrink-0" aria-label="Select website">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTIVE_WEBSITES.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                <span className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-secondary text-[8px] font-semibold">
                    {site.initials}
                  </span>
                  {site.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <RangePicker />
        </div>

        <label className="ml-auto hidden shrink-0 cursor-pointer select-none items-center gap-2 sm:flex">
          <GitCompareArrows className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[12px] font-medium text-muted-foreground">Compare previous</span>
          <Switch checked={compare} onCheckedChange={setCompare} aria-label="Compare previous period" />
        </label>
      </div>
    </div>
  );
}
