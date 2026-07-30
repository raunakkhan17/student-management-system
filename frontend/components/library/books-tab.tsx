'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  BookMarked,
  BookmarkPlus,
  Copy,
  Download,
  Library,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useCrudMutations } from '@/hooks/use-crud-mutations';
import { useTableState } from '@/hooks/use-table-state';
import { ApiError } from '@/lib/api-client';
import { downloadBlob } from '@/lib/download';
import { libraryService } from '@/services/library.service';
import type { Book } from '@/types/library';
import { AddCopiesDialog } from './add-copies-dialog';
import { BookDetailSheet } from './book-detail-sheet';
import { BookFormDialog } from './book-form-dialog';

const ALL = '__all__';
const QUERY_KEY = ['library', 'books'] as const;

export function BooksTab() {
  const { can, hasRole } = useAuth();
  const table = useTableState({ defaultSortBy: 'title', defaultSortOrder: 'asc' });

  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [availabilityFilter, setAvailabilityFilter] = useState(ALL);
  const [editing, setEditing] = useState<Book | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [copiesTarget, setCopiesTarget] = useState<Book | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const deleteTarget = useConfirmTarget<Book>();

  const isSelfService = hasRole('STUDENT', 'PARENT');

  const categories = useQuery({
    queryKey: ['library', 'categories', 'all'],
    queryFn: () => libraryService.listCategories({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
  });

  const params = {
    ...table.queryParams,
    ...(categoryFilter !== ALL ? { categoryId: categoryFilter } : {}),
    ...(availabilityFilter === 'available' ? { onlyAvailable: true } : {}),
  };

  const query = useQuery({
    queryKey: [...QUERY_KEY, params],
    queryFn: () => libraryService.listBooks(params),
  });

  const { deleteMutation } = useCrudMutations<never, never, Book>({
    queryKey: QUERY_KEY,
    entityName: 'title',
    remove: libraryService.deleteBook,
  });

  const reserveMutation = useMutation({
    mutationFn: (bookId: string) => libraryService.reserveBook({ bookId, holdDays: 3 }),
    onSuccess: () => toast.success('Reservation placed — you will be notified when a copy frees up'),
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not place the reservation');
    },
  });

  const exportMutation = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') => libraryService.exportCatalogue(format),
    onSuccess: (blob, format) => {
      downloadBlob(blob, `library-catalogue-${new Date().toISOString().slice(0, 10)}.${format}`);
      toast.success('Catalogue downloaded');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not export the catalogue');
    },
  });

  const isFiltered =
    table.state.search.length > 0 || categoryFilter !== ALL || availabilityFilter !== ALL;

  const openCreate = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const columns = useMemo<ColumnDef<Book, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Title',
        meta: { sortKey: 'title' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.title}</p>
            <p className="text-muted-foreground truncate text-sm">
              {row.original.authors.map((link) => link.author.name).join(', ') || 'Author unknown'}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'isbn',
        header: 'ISBN',
        meta: { sortKey: 'isbn', hideOnMobile: true, cellClassName: 'tabular-nums' },
      },
      {
        id: 'category',
        header: 'Category',
        meta: { hideOnMobile: true },
        cell: ({ row }) => <Badge variant="secondary">{row.original.category.name}</Badge>,
      },
      {
        id: 'availability',
        header: 'Available',
        meta: { cellClassName: 'tabular-nums' },
        cell: ({ row }) => {
          const { availableCopies, totalCopies } = row.original;
          return (
            <span
              className={
                totalCopies === 0
                  ? 'text-muted-foreground'
                  : availableCopies === 0
                    ? 'text-destructive font-medium'
                    : 'text-success font-medium'
              }
            >
              {availableCopies} / {totalCopies}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        meta: { cellClassName: 'w-12' },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Row actions"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
              <DropdownMenuItem onClick={() => setDetailId(row.original.id)}>
                <Library className="size-4" aria-hidden />
                View holdings
              </DropdownMenuItem>

              {row.original.availableCopies === 0 && row.original.totalCopies > 0 && (
                <DropdownMenuItem
                  disabled={reserveMutation.isPending}
                  onClick={() => reserveMutation.mutate(row.original.id)}
                >
                  <BookmarkPlus className="size-4" aria-hidden />
                  Reserve
                </DropdownMenuItem>
              )}

              {can('LIBRARY', 'CREATE') && (
                <DropdownMenuItem onClick={() => setCopiesTarget(row.original)}>
                  <Copy className="size-4" aria-hidden />
                  Register copies
                </DropdownMenuItem>
              )}

              {can('LIBRARY', 'EDIT') && (
                <DropdownMenuItem
                  onClick={() => {
                    setEditing(row.original);
                    setIsFormOpen(true);
                  }}
                >
                  <Pencil className="size-4" aria-hidden />
                  Edit
                </DropdownMenuItem>
              )}

              {can('LIBRARY', 'DELETE') && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => deleteTarget.open(row.original)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Withdraw
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [can, deleteTarget, reserveMutation],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        {...(query.data ? { pagination: query.data.pagination } : {})}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        sortBy={table.state.sortBy}
        sortOrder={table.state.sortOrder}
        onSortChange={table.toggleSort}
        onPageChange={table.setPage}
        onLimitChange={table.setLimit}
        getRowId={(row) => row.id}
        onRowClick={(row) => setDetailId(row.id)}
        toolbar={
          <DataTableToolbar
            search={table.state.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Title, ISBN or author…"
            isFiltered={isFiltered}
            onReset={() => {
              table.reset();
              setCategoryFilter(ALL);
              setAvailabilityFilter(ALL);
            }}
            filters={
              <>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[11rem]" aria-label="Filter by category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All categories</SelectItem>
                    {(categories.data?.items ?? []).map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
                  <SelectTrigger className="w-[10rem]" aria-label="Filter by availability">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All titles</SelectItem>
                    <SelectItem value="available">On the shelf</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              <>
                {can('LIBRARY', 'EXPORT') && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" disabled={exportMutation.isPending}>
                        <Download className="size-4" aria-hidden />
                        {exportMutation.isPending ? 'Exporting…' : 'Export'}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => exportMutation.mutate('xlsx')}>
                        Excel (.xlsx)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportMutation.mutate('csv')}>
                        CSV (.csv)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {can('LIBRARY', 'CREATE') && (
                  <Button onClick={openCreate}>
                    <Plus className="size-4" aria-hidden />
                    Catalogue title
                  </Button>
                )}
              </>
            }
          />
        }
        emptyState={
          <EmptyState
            icon={BookMarked}
            title={isFiltered ? 'No matching titles' : 'The catalogue is empty'}
            description={
              isSelfService
                ? 'Nothing has been catalogued yet.'
                : 'Catalogue a title, then register its physical copies.'
            }
            action={
              !isFiltered &&
              can('LIBRARY', 'CREATE') && (
                <Button onClick={openCreate}>
                  <Plus className="size-4" aria-hidden />
                  Catalogue title
                </Button>
              )
            }
          />
        }
      />

      <BookFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} book={editing} />

      <AddCopiesDialog
        book={copiesTarget}
        onOpenChange={(open) => {
          if (!open) setCopiesTarget(null);
        }}
      />

      <BookDetailSheet
        bookId={detailId}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      />

      <ConfirmDialog
        open={deleteTarget.isOpen}
        onOpenChange={deleteTarget.onOpenChange}
        title="Withdraw this title?"
        description={
          <>
            <strong>{deleteTarget.target?.title}</strong> will be withdrawn from the catalogue. This
            is only possible while none of its copies are on loan.
          </>
        }
        confirmLabel="Withdraw title"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget.target) {
            await deleteMutation.mutateAsync(deleteTarget.target.id);
          }
        }}
      />
    </>
  );
}
