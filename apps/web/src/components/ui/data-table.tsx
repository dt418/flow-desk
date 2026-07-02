/**
 * TanStack Table data table, shadcn-style.
 *
 * Wraps `<Table>` primitives from `@/components/ui/table` so the layout
 * matches shadcn's canonical data-table pattern. Run
 *   pnpm dlx shadcn@latest add data-table
 * to fetch the official version (uses the same component shapes).
 */
import * as React from 'react';
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronDown, ChevronUp, ChevronsUpDown, Search, Settings2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { cn } from '@/lib/utils';

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  searchPlaceholder?: string;
  searchKey?: string;
  pageSize?: number;
  empty?: React.ReactNode;
  className?: string;
  /** Called when a row body is clicked (not when a cell's own button is clicked). */
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData>({
  columns,
  data,
  searchPlaceholder = 'Filter…',
  searchKey,
  pageSize = 25,
  empty = 'No results.',
  className,
  onRowClick,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState('');

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={
              searchKey
                ? ((table.getColumn(searchKey)?.getFilterValue() as string) ?? '')
                : globalFilter
            }
            onChange={(e) =>
              searchKey
                ? table.getColumn(searchKey)?.setFilterValue(e.target.value)
                : setGlobalFilter(e.target.value)
            }
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40"
          />
        </div>
        {table.getAllColumns().some((c) => c.getCanHide()) && (
          <details className="relative">
            <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground hover:bg-muted">
              <Settings2 className="h-4 w-4" />
              Columns
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-border bg-popover p-2 shadow-lg">
              {table
                .getAllColumns()
                .filter((c) => c.getCanHide())
                .map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={c.getIsVisible()}
                      onChange={c.getToggleVisibilityHandler()}
                    />
                    {typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id}
                  </label>
                ))}
            </div>
          </details>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sort = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                          className={cn(
                            'inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider',
                            canSort && 'cursor-pointer select-none hover:text-primary',
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort &&
                            (sort === 'asc' ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : sort === 'desc' ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                            ))}
                        </button>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={cn('group/row', onRowClick && 'cursor-pointer')}
                  onClick={(e) => {
                    // Don't open the row modal if the user clicked an interactive
                    // element inside the cell (button, input, a, select, etc.).
                    const target = e.target as HTMLElement;
                    if (target.closest('button, a, input, select, textarea, [role="button"]')) {
                      return;
                    }
                    onRowClick?.(row.original);
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {table.getFilteredRowModel().rows.length} of {data.length} row(s)
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="inline-flex h-7 items-center rounded-md border border-input bg-card px-2.5 text-xs disabled:opacity-50"
          >
            Prev
          </button>
          <span className="tabular-nums">
            Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
          </span>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="inline-flex h-7 items-center rounded-md border border-input bg-card px-2.5 text-xs disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
