'use client';

import { useQuery } from '@tanstack/react-query';
import { hostelService } from '@/services/hostel.service';

/**
 * Hostel list for filters and form selects.
 *
 * There are only ever a handful of blocks, so the whole list is fetched once and
 * shared through the query cache rather than searched.
 */
export function useHostelOptions(enabled = true) {
  return useQuery({
    queryKey: ['hostel', 'options'],
    queryFn: () => hostelService.list({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
    select: (page) => page.items,
    enabled,
  });
}
