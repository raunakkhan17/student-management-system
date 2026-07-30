'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn } from '@/lib/utils';

interface AsyncComboboxProps<TItem> {
  /** Selected id, or null when nothing is chosen. */
  value: string | null;
  onChange: (id: string | null, item: TItem | null) => void;
  /** Query key prefix; the debounced search term is appended automatically. */
  queryKey: readonly unknown[];
  fetcher: (search: string) => Promise<TItem[]>;
  getId: (item: TItem) => string;
  getLabel: (item: TItem) => string;
  getDescription?: (item: TItem) => string | null;
  /** Shown on the trigger when the selected item is not in the current results. */
  selectedLabel?: string | null;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  /** Renders a "clear" entry at the top of the list. */
  clearable?: boolean;
  clearLabel?: string;
}

/**
 * Searchable picker for lists too large to load into a `<Select>`.
 *
 * Filtering happens on the server, so the local `cmdk` filter is switched off —
 * otherwise it would hide rows the API deliberately returned.
 */
export function AsyncCombobox<TItem>({
  value,
  onChange,
  queryKey,
  fetcher,
  getId,
  getLabel,
  getDescription,
  selectedLabel,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches found.',
  disabled = false,
  className,
  clearable = false,
  clearLabel = 'None',
}: AsyncComboboxProps<TItem>) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Remembers what the user picked, so narrowing the search afterwards does not
  // blank the trigger. Callers therefore never have to mirror the selection.
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useQuery({
    queryKey: [...queryKey, debouncedSearch],
    queryFn: () => fetcher(debouncedSearch.trim()),
    enabled: isOpen,
  });

  const items = query.data ?? [];
  const selected = items.find((item) => getId(item) === value);

  // A null value means the form was reset, so any remembered label is stale.
  const triggerLabel =
    value === null
      ? null
      : selected
        ? getLabel(selected)
        : (pickedLabel ?? selectedLabel ?? null);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={isOpen}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !triggerLabel && 'text-muted-foreground', className)}
        >
          <span className="truncate">{triggerLabel ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={search} onValueChange={setSearch} placeholder={searchPlaceholder} />
          <CommandList>
            {query.isFetching && items.length === 0 ? (
              <div className="text-muted-foreground flex items-center gap-2 px-3 py-6 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Searching…
              </div>
            ) : (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            )}

            <CommandGroup>
              {clearable && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    setPickedLabel(null);
                    onChange(null, null);
                    setIsOpen(false);
                  }}
                >
                  <Check className={cn('size-4', value ? 'opacity-0' : 'opacity-100')} aria-hidden />
                  <span className="text-muted-foreground">{clearLabel}</span>
                </CommandItem>
              )}

              {items.map((item) => {
                const id = getId(item);
                const description = getDescription?.(item);

                return (
                  <CommandItem
                    key={id}
                    value={id}
                    onSelect={() => {
                      setPickedLabel(getLabel(item));
                      onChange(id, item);
                      setIsOpen(false);
                    }}
                  >
                    <Check
                      className={cn('size-4 shrink-0', value === id ? 'opacity-100' : 'opacity-0')}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{getLabel(item)}</span>
                      {description && (
                        <span className="text-muted-foreground block truncate text-xs">
                          {description}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
