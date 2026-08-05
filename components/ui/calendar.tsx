"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * react-day-picker v9, styled with the app's tokens instead of its stylesheet —
 * keeps the picker visually part of the dashboard rather than a bolted-on widget.
 */
export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-1", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "space-y-3",
        month_caption: "flex justify-center pt-1 relative items-center h-8",
        caption_label: "text-[13px] font-medium",
        nav: "flex items-center gap-1 absolute right-1 top-1 z-10",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "h-6 w-6 p-0 opacity-60 hover:opacity-100",
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "h-6 w-6 p-0 opacity-60 hover:opacity-100",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-8 font-normal text-[11px]",
        week: "flex w-full mt-1",
        day: cn(
          "relative p-0 text-center text-[13px] focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-accent",
          "[&:has(.range-start)]:rounded-l-md [&:has(.range-end)]:rounded-r-md",
        ),
        day_button: cn(
          "h-8 w-8 rounded-md p-0 font-normal transition-colors hover:bg-secondary aria-selected:opacity-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        ),
        range_start: "range-start [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
        range_end: "range-end [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
        range_middle: "[&>button]:bg-transparent [&>button]:text-accent-foreground",
        selected: "",
        today: "[&>button]:font-semibold [&>button]:underline [&>button]:underline-offset-4",
        outside: "text-muted-foreground/50",
        disabled: "text-muted-foreground/40 [&>button]:pointer-events-none",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" {...rest} />
          ) : (
            <ChevronRight className="h-4 w-4" {...rest} />
          ),
      }}
      {...props}
    />
  );
}
