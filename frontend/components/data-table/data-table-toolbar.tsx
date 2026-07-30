'use client';

import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface DataTableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Filter controls rendered beside the search field. */
  filters?: ReactNode;
  /** Bulk or page-level actions, right-aligned. */
  actions?: ReactNode;
  /** Shown when any filter is active, to offer a one-click reset. */
  isFiltered?: boolean;
  onReset?: () => void;
  className?: string;
}

export function DataTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters,
  actions,
  isFiltered = false,
  onReset,
  className,
}: DataTableToolbarProps) {
  return (
    <div className={cn('flex flex-col gap-3 lg:flex-row lg:items-center', className)}>
      <div className="relative w-full lg:max-w-xs">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
          aria-label={searchPlaceholder}
          type="search"
        />
      </div>

      {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}

      {isFiltered && onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} className="w-fit">
          <X className="size-4" aria-hidden />
          Clear
        </Button>
      )}

      {actions && <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{actions}</div>}
    </div>
  );
}
