'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ListQueryParams, SortOrder } from '@/types/api';
import { useDebouncedValue } from './use-debounced-value';

export interface TableState extends Required<Pick<ListQueryParams, 'page' | 'limit' | 'sortOrder'>> {
  search: string;
  sortBy: string;
}

interface UseTableStateOptions {
  defaultSortBy: string;
  defaultSortOrder?: SortOrder;
  defaultLimit?: number;
}

export interface UseTableStateResult {
  state: TableState;
  /** Debounced query object ready to pass to a service call. */
  queryParams: ListQueryParams;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setSearch: (search: string) => void;
  /** Toggles direction when the same column is clicked again. */
  toggleSort: (column: string) => void;
  reset: () => void;
}

/**
 * Server-driven table state: page, page size, search and sort.
 *
 * Search is debounced so typing does not fire a request per keystroke, and any
 * change other than paging resets to page 1 — otherwise a narrowed result set
 * can leave the user stranded on an empty page.
 */
export function useTableState({
  defaultSortBy,
  defaultSortOrder = 'asc',
  defaultLimit = 20,
}: UseTableStateOptions): UseTableStateResult {
  const initial = useMemo<TableState>(
    () => ({
      page: 1,
      limit: defaultLimit,
      search: '',
      sortBy: defaultSortBy,
      sortOrder: defaultSortOrder,
    }),
    [defaultLimit, defaultSortBy, defaultSortOrder],
  );

  const [state, setState] = useState<TableState>(initial);
  const debouncedSearch = useDebouncedValue(state.search, 350);

  const setPage = useCallback((page: number) => {
    setState((current) => ({ ...current, page }));
  }, []);

  const setLimit = useCallback((limit: number) => {
    setState((current) => ({ ...current, limit, page: 1 }));
  }, []);

  const setSearch = useCallback((search: string) => {
    setState((current) => ({ ...current, search, page: 1 }));
  }, []);

  const toggleSort = useCallback((column: string) => {
    setState((current) => ({
      ...current,
      page: 1,
      sortBy: column,
      sortOrder: current.sortBy === column && current.sortOrder === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const reset = useCallback(() => setState(initial), [initial]);

  const queryParams = useMemo<ListQueryParams>(
    () => ({
      page: state.page,
      limit: state.limit,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
      ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
    }),
    [state.page, state.limit, state.sortBy, state.sortOrder, debouncedSearch],
  );

  return { state, queryParams, setPage, setLimit, setSearch, toggleSort, reset };
}
