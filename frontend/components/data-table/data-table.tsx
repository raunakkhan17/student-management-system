'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type RowSelectionState,
  type Table as TanStackTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { PaginationMeta, SortOrder } from '@/types/api';
import { DataTablePagination } from './data-table-pagination';

/** Extra metadata columns can declare, read by the header and cell renderers. */
export interface DataTableColumnMeta {
  /** Server-side sort key. Presence makes the header a sort button. */
  sortKey?: string;
  headerClassName?: string;
  cellClassName?: string;
  /** Hides the column below the `md` breakpoint. */
  hideOnMobile?: boolean;
}

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue>
    extends DataTableColumnMeta {
    // TData/TValue are required by the base declaration but unused here.
    _phantom?: [TData, TValue];
  }
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  pagination?: PaginationMeta;
  isLoading?: boolean;
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;

  sortBy?: string;
  sortOrder?: SortOrder;
  onSortChange?: (column: string) => void;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;

  /** Stable row identity, required for selection to survive refetches. */
  getRowId?: (row: TData) => string;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;

  onRowClick?: (row: TData) => void;
  toolbar?: ReactNode;
  emptyState?: ReactNode;
  /** Rows rendered by the loading skeleton. */
  skeletonRows?: number;
  className?: string;
}

export function DataTable<TData>({
  columns,
  data,
  pagination,
  isLoading = false,
  isFetching = false,
  error,
  onRetry,
  sortBy,
  sortOrder = 'asc',
  onSortChange,
  onPageChange,
  onLimitChange,
  getRowId,
  rowSelection,
  onRowSelectionChange,
  onRowClick,
  toolbar,
  emptyState,
  skeletonRows = 8,
  className,
}: DataTableProps<TData>) {
  const table: TanStackTable<TData> = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // Paging, sorting and filtering all happen on the server.
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableRowSelection: Boolean(onRowSelectionChange),
    state: rowSelection ? { rowSelection } : {},
    onRowSelectionChange: onRowSelectionChange
      ? (updater) => {
          const next =
            typeof updater === 'function' ? updater(rowSelection ?? {}) : updater;
          onRowSelectionChange(next);
        }
      : undefined,
    ...(getRowId ? { getRowId } : {}),
  });

  const columnCount = columns.length;

  return (
    <div className={cn('bg-card overflow-hidden rounded-xl border', className)}>
      {toolbar && <div className="border-b p-4">{toolbar}</div>}

      {error ? (
        <ErrorState error={error} {...(onRetry ? { onRetry } : {})} />
      ) : (
        <>
          {/* Horizontal scroll is contained here so the page never scrolls sideways. */}
          <div className="relative w-full overflow-x-auto">
            {isFetching && !isLoading && (
              <div
                className="bg-primary/70 absolute inset-x-0 top-0 h-0.5 animate-pulse"
                role="status"
                aria-label="Refreshing"
              />
            )}

            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="hover:bg-transparent">
                    {headerGroup.headers.map((header) => {
                      const meta = header.column.columnDef.meta;
                      const sortKey = meta?.sortKey;
                      const isSorted = sortKey !== undefined && sortBy === sortKey;

                      return (
                        <TableHead
                          key={header.id}
                          className={cn(
                            'whitespace-nowrap',
                            meta?.headerClassName,
                            meta?.hideOnMobile && 'hidden md:table-cell',
                          )}
                          aria-sort={
                            isSorted ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined
                          }
                        >
                          {header.isPlaceholder ? null : sortKey && onSortChange ? (
                            <button
                              type="button"
                              onClick={() => onSortChange(sortKey)}
                              className="hover:text-foreground focus-visible:ring-ring -mx-2 flex items-center gap-1.5 rounded px-2 py-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {isSorted ? (
                                sortOrder === 'asc' ? (
                                  <ArrowUp className="size-3.5" aria-hidden />
                                ) : (
                                  <ArrowDown className="size-3.5" aria-hidden />
                                )
                              ) : (
                                <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden />
                              )}
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                    <TableRow key={`skeleton-${rowIndex}`} className="hover:bg-transparent">
                      {Array.from({ length: columnCount }).map((__, cellIndex) => (
                        <TableCell key={`skeleton-cell-${cellIndex}`}>
                          <Skeleton className="h-5 w-full max-w-40" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : table.getRowModel().rows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={columnCount} className="p-0">
                      {emptyState ?? (
                        <EmptyState
                          title="Nothing to show yet"
                          description="Adjust your filters, or add the first record."
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() ? 'selected' : undefined}
                      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                      className={cn(onRowClick && 'cursor-pointer')}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef.meta;
                        return (
                          <TableCell
                            key={cell.id}
                            className={cn(
                              meta?.cellClassName,
                              meta?.hideOnMobile && 'hidden md:table-cell',
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {pagination && onPageChange && onLimitChange && (
            <DataTablePagination
              pagination={pagination}
              onPageChange={onPageChange}
              onLimitChange={onLimitChange}
              selectedCount={rowSelection ? Object.keys(rowSelection).length : undefined}
            />
          )}
        </>
      )}
    </div>
  );
}
