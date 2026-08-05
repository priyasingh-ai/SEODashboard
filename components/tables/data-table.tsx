"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/dashboard/empty-state";
import { cn } from "@/lib/utils";

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  data: TData[];
  /** Renders the search box when set. */
  searchPlaceholder?: string;
  /** Which fields the search box matches against. */
  searchKeys?: (keyof TData)[];
  pageSize?: number;
  /** Turn off the footer for short, fixed tables (e.g. Top Queries). */
  paginate?: boolean;
  initialSort?: SortingState;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Extra controls rendered in the toolbar, right of the search box. */
  toolbar?: React.ReactNode;
  /** Wrapper class — use to drop the border when nesting inside a card. */
  className?: string;
  onRowClick?: (row: TData) => void;
}

/**
 * The one table in the app.
 *
 * Sorting, filtering and pagination all come from TanStack's row models, so the
 * column definitions stay declarative and every table on every page behaves
 * identically. Column meta carries alignment and responsive visibility, which
 * keeps the markup here generic.
 */
export function DataTable<TData>({
  columns,
  data,
  searchPlaceholder,
  searchKeys,
  pageSize = 10,
  paginate = true,
  initialSort = [],
  emptyTitle = "No results",
  emptyDescription,
  toolbar,
  className,
  onRowClick,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSort);

  // Two states, deliberately. `inputValue` tracks the field keystroke-by-
  // keystroke so typing always feels instant; `globalFilter` is what actually
  // re-runs the filter across every row and re-derives the table, and it trails
  // the input by a short debounce. Without the split, each keystroke would
  // recompute the filtered and sorted row models synchronously — cheap on ten
  // rows, but the kind of per-keystroke work that shows up as INP on a full
  // 250-row query table.
  const [inputValue, setInputValue] = React.useState("");
  const [globalFilter, setGlobalFilter] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setGlobalFilter(inputValue), 150);
    return () => clearTimeout(t);
  }, [inputValue]);

  // Substring match across the declared search keys — the tables here are small
  // and local, so this beats pulling in a fuzzy-match dependency.
  const globalFilterFn = React.useCallback(
    (row: { original: TData }, _columnId: string, filterValue: string) => {
      if (!filterValue) return true;
      const needle = filterValue.toLowerCase();
      const keys = searchKeys ?? (Object.keys(row.original as object) as (keyof TData)[]);
      return keys.some((key) => String(row.original[key] ?? "").toLowerCase().includes(needle));
    },
    [searchKeys],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: globalFilterFn as never,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(paginate ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    initialState: { pagination: { pageSize } },
  });

  const rows = table.getRowModel().rows;
  const showToolbar = !!searchPlaceholder || !!toolbar;

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-card", className)}>
      {showToolbar && (
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          {searchPlaceholder ? (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 pl-8 text-[13px]"
                aria-label={searchPlaceholder}
              />
            </div>
          ) : (
            <span />
          )}
          {toolbar}
        </div>
      )}

      <div className="w-full overflow-x-auto scrollbar-thin">
        <table className="w-full caption-bottom text-sm">
          <thead className="bg-muted/40">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-border">
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta as
                    | { align?: "left" | "right"; className?: string }
                    | undefined;
                  const sortable = header.column.getCanSort();
                  const dir = header.column.getIsSorted();
                  const Icon = dir === "asc" ? ChevronUp : dir === "desc" ? ChevronDown : ChevronsUpDown;

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                      className={cn(
                        "h-9 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
                        meta?.align === "right" ? "text-right" : "text-left",
                        meta?.className,
                      )}
                      aria-sort={
                        dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"
                      }
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            meta?.align === "right" && "flex-row-reverse",
                            dir && "text-foreground",
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <Icon
                            className={cn("h-3 w-3 shrink-0", !dir && "opacity-40")}
                            strokeWidth={2.5}
                          />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    "border-b border-border transition-colors last:border-0 hover:bg-muted/40",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as
                      | { align?: "left" | "right"; className?: string }
                      | undefined;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "px-3 py-2.5 text-[13px]",
                          meta?.align === "right" ? "text-right tabular" : "text-left",
                          meta?.className,
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState
                    inset
                    icon={Search}
                    title={emptyTitle}
                    description={
                      emptyDescription ??
                      (globalFilter
                        ? `Nothing matches “${globalFilter}”.`
                        : "There's no data for this range yet.")
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {paginate && table.getPageCount() > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground tabular">
            {table.getFilteredRowModel().rows.length.toLocaleString("en-US")} rows · page{" "}
            {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
