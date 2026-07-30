'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatNumber } from '@/lib/format';
import type { PaginationMeta } from '@/types/api';

const PAGE_SIZES = [10, 20, 50, 100] as const;

interface DataTablePaginationProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  /** Number of rows selected, shown on the left when selection is enabled. */
  selectedCount?: number;
}

export function DataTablePagination({
  pagination,
  onPageChange,
  onLimitChange,
  selectedCount,
}: DataTablePaginationProps) {
  const { page, limit, totalItems, totalPages, hasNextPage, hasPreviousPage } = pagination;

  const firstRow = totalItems === 0 ? 0 : (page - 1) * limit + 1;
  const lastRow = Math.min(page * limit, totalItems);

  return (
    <div className="flex flex-col gap-4 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {selectedCount ? (
          <>
            <span className="text-foreground font-medium">{formatNumber(selectedCount)}</span>{' '}
            selected ·{' '}
          </>
        ) : null}
        Showing <span className="text-foreground font-medium">{formatNumber(firstRow)}</span>–
        <span className="text-foreground font-medium">{formatNumber(lastRow)}</span> of{' '}
        <span className="text-foreground font-medium">{formatNumber(totalItems)}</span>
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="rows-per-page" className="text-muted-foreground text-sm whitespace-nowrap">
            Rows per page
          </label>
          <Select
            value={String(limit)}
            onValueChange={(value) => onLimitChange(Number(value))}
          >
            <SelectTrigger id="rows-per-page" size="sm" className="w-[4.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-muted-foreground mr-2 text-sm whitespace-nowrap">
            Page {formatNumber(page)} of {formatNumber(Math.max(totalPages, 1))}
          </span>

          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => onPageChange(1)}
            disabled={!hasPreviousPage}
            aria-label="First page"
          >
            <ChevronsLeft className="size-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => onPageChange(page - 1)}
            disabled={!hasPreviousPage}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNextPage}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => onPageChange(totalPages)}
            disabled={!hasNextPage}
            aria-label="Last page"
          >
            <ChevronsRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
