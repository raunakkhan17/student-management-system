'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { FormDialog } from '@/components/common/form-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useCrudMutations } from '@/hooks/use-crud-mutations';
import { applyApiErrors } from '@/lib/form-errors';
import { libraryService } from '@/services/library.service';
import type { Author, BookCategory, Publisher, Shelf } from '@/types/library';

type TaxonomyKind = 'category' | 'author' | 'publisher' | 'shelf';

const LIST_PARAMS = { limit: 100, sortOrder: 'asc' } as const;

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and dashes only'),
  description: z.string().trim().max(300).optional(),
});

const authorSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  biography: z.string().trim().max(2000).optional(),
});

const publisherSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  address: z.string().trim().max(300).optional(),
  contact: z.string().trim().max(60).optional(),
  email: z.string().trim().max(160).optional(),
});

const shelfSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and dashes only'),
  name: z.string().trim().min(1, 'Name is required').max(120),
  location: z.string().trim().max(160).optional(),
  capacity: z.coerce.number().int().min(1).max(10_000),
});

/** One card per taxonomy list, so a librarian can set the catalogue up in one place. */
export function TaxonomyTab() {
  const { can } = useAuth();
  const [dialog, setDialog] = useState<TaxonomyKind | null>(null);

  const categories = useQuery({
    queryKey: ['library', 'categories', 'all'],
    queryFn: () => libraryService.listCategories({ ...LIST_PARAMS, sortBy: 'name' }),
  });

  const authors = useQuery({
    queryKey: ['library', 'authors', 'all'],
    queryFn: () => libraryService.listAuthors({ ...LIST_PARAMS, sortBy: 'name' }),
  });

  const publishers = useQuery({
    queryKey: ['library', 'publishers', 'all'],
    queryFn: () => libraryService.listPublishers({ ...LIST_PARAMS, sortBy: 'name' }),
  });

  const shelves = useQuery({
    queryKey: ['library', 'shelves', 'all'],
    queryFn: () => libraryService.listShelves({ ...LIST_PARAMS, sortBy: 'code' }),
  });

  const categoryTarget = useConfirmTarget<BookCategory>();
  const shelfTarget = useConfirmTarget<Shelf>();

  const categoryMutations = useCrudMutations<z.infer<typeof categorySchema>, never, BookCategory>({
    queryKey: ['library', 'categories'],
    entityName: 'category',
    create: libraryService.createCategory,
    remove: libraryService.deleteCategory,
    onSuccess: () => setDialog(null),
  });

  const authorMutations = useCrudMutations<z.infer<typeof authorSchema>, never, Author>({
    queryKey: ['library', 'authors'],
    entityName: 'author',
    create: libraryService.createAuthor,
    onSuccess: () => setDialog(null),
  });

  const publisherMutations = useCrudMutations<z.infer<typeof publisherSchema>, never, Publisher>({
    queryKey: ['library', 'publishers'],
    entityName: 'publisher',
    create: libraryService.createPublisher,
    onSuccess: () => setDialog(null),
  });

  const shelfMutations = useCrudMutations<z.infer<typeof shelfSchema>, never, Shelf>({
    queryKey: ['library', 'shelves'],
    entityName: 'shelf',
    create: libraryService.createShelf,
    remove: libraryService.deleteShelf,
    onSuccess: () => setDialog(null),
  });

  const categoryForm = useForm<z.infer<typeof categorySchema>>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', code: '', description: '' },
  });

  const authorForm = useForm<z.infer<typeof authorSchema>>({
    resolver: zodResolver(authorSchema),
    defaultValues: { name: '', biography: '' },
  });

  const publisherForm = useForm<z.infer<typeof publisherSchema>>({
    resolver: zodResolver(publisherSchema),
    defaultValues: { name: '', address: '', contact: '', email: '' },
  });

  const shelfForm = useForm<z.infer<typeof shelfSchema>>({
    resolver: zodResolver(shelfSchema),
    defaultValues: { code: '', name: '', location: '', capacity: 100 },
  });

  useEffect(() => {
    if (dialog === 'category') categoryForm.reset({ name: '', code: '', description: '' });
    if (dialog === 'author') authorForm.reset({ name: '', biography: '' });
    if (dialog === 'publisher') publisherForm.reset({ name: '', address: '', contact: '', email: '' });
    if (dialog === 'shelf') shelfForm.reset({ code: '', name: '', location: '', capacity: 100 });
  }, [dialog, categoryForm, authorForm, publisherForm, shelfForm]);

  const canCreate = can('LIBRARY', 'CREATE');
  const canDelete = can('LIBRARY', 'DELETE');

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <TaxonomyCard
          title="Categories"
          description="Subject classification used across the catalogue."
          isLoading={categories.isLoading}
          error={categories.error}
          onRetry={() => void categories.refetch()}
          emptyLabel="No categories yet"
          onAdd={canCreate ? () => setDialog('category') : undefined}
          addLabel="New category"
          rows={(categories.data?.items ?? []).map((category) => ({
            id: category.id,
            primary: category.name,
            secondary: category.code,
            ...(canDelete ? { onDelete: () => categoryTarget.open(category) } : {}),
          }))}
        />

        <TaxonomyCard
          title="Shelves"
          description="Physical locations where copies are stored."
          isLoading={shelves.isLoading}
          error={shelves.error}
          onRetry={() => void shelves.refetch()}
          emptyLabel="No shelves yet"
          onAdd={canCreate ? () => setDialog('shelf') : undefined}
          addLabel="New shelf"
          rows={(shelves.data?.items ?? []).map((shelf) => ({
            id: shelf.id,
            primary: `${shelf.code} · ${shelf.name}`,
            secondary: [shelf.location, `capacity ${shelf.capacity}`].filter(Boolean).join(' · '),
            ...(canDelete ? { onDelete: () => shelfTarget.open(shelf) } : {}),
          }))}
        />

        <TaxonomyCard
          title="Authors"
          description="Added automatically when catalogued from a title."
          isLoading={authors.isLoading}
          error={authors.error}
          onRetry={() => void authors.refetch()}
          emptyLabel="No authors yet"
          onAdd={canCreate ? () => setDialog('author') : undefined}
          addLabel="New author"
          rows={(authors.data?.items ?? []).map((author) => ({
            id: author.id,
            primary: author.name,
            secondary: author.biography ?? '',
          }))}
        />

        <TaxonomyCard
          title="Publishers"
          description="Used for acquisition records and reporting."
          isLoading={publishers.isLoading}
          error={publishers.error}
          onRetry={() => void publishers.refetch()}
          emptyLabel="No publishers yet"
          onAdd={canCreate ? () => setDialog('publisher') : undefined}
          addLabel="New publisher"
          rows={(publishers.data?.items ?? []).map((publisher) => ({
            id: publisher.id,
            primary: publisher.name,
            secondary: [publisher.contact, publisher.email].filter(Boolean).join(' · '),
          }))}
        />
      </div>

      <FormDialog
        open={dialog === 'category'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="New category"
        description="Categories group titles by subject."
        formId="library-category-form"
        isSubmitting={categoryForm.formState.isSubmitting}
        submitLabel="Create category"
      >
        <Form {...categoryForm}>
          <form
            id="library-category-form"
            className="space-y-5"
            noValidate
            onSubmit={categoryForm.handleSubmit(async (values) => {
              try {
                await categoryMutations.createMutation.mutateAsync(values);
              } catch (error) {
                applyApiErrors(error, categoryForm.setError, ['name', 'code', 'description']);
              }
            })}
          >
            <FormField
              control={categoryForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Computer Science" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={categoryForm.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="CS"
                      className="uppercase"
                      onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={categoryForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} placeholder="Optional notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDialog>

      <FormDialog
        open={dialog === 'shelf'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="New shelf"
        description="Where copies physically live."
        formId="library-shelf-form"
        isSubmitting={shelfForm.formState.isSubmitting}
        submitLabel="Create shelf"
      >
        <Form {...shelfForm}>
          <form
            id="library-shelf-form"
            className="space-y-5"
            noValidate
            onSubmit={shelfForm.handleSubmit(async (values) => {
              try {
                await shelfMutations.createMutation.mutateAsync(values);
              } catch (error) {
                applyApiErrors(error, shelfForm.setError, ['code', 'name', 'location', 'capacity']);
              }
            })}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={shelfForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="A-01"
                        className="uppercase"
                        autoFocus
                        onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={shelfForm.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacity</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={shelfForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Reference — ground floor" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={shelfForm.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Block B, Reading Room 1" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDialog>

      <FormDialog
        open={dialog === 'author'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="New author"
        formId="library-author-form"
        isSubmitting={authorForm.formState.isSubmitting}
        submitLabel="Add author"
      >
        <Form {...authorForm}>
          <form
            id="library-author-form"
            className="space-y-5"
            noValidate
            onSubmit={authorForm.handleSubmit(async (values) => {
              try {
                await authorMutations.createMutation.mutateAsync(values);
              } catch (error) {
                applyApiErrors(error, authorForm.setError, ['name', 'biography']);
              }
            })}
          >
            <FormField
              control={authorForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Donald E. Knuth" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={authorForm.control}
              name="biography"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Biography</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="Optional" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDialog>

      <FormDialog
        open={dialog === 'publisher'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="New publisher"
        formId="library-publisher-form"
        isSubmitting={publisherForm.formState.isSubmitting}
        submitLabel="Add publisher"
      >
        <Form {...publisherForm}>
          <form
            id="library-publisher-form"
            className="space-y-5"
            noValidate
            onSubmit={publisherForm.handleSubmit(async (values) => {
              try {
                await publisherMutations.createMutation.mutateAsync(values);
              } catch (error) {
                applyApiErrors(error, publisherForm.setError, [
                  'name',
                  'address',
                  'contact',
                  'email',
                ]);
              }
            })}
          >
            <FormField
              control={publisherForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="MIT Press" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={publisherForm.control}
                name="contact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="+91 98765 43210" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={publisherForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="orders@example.com" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={publisherForm.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} placeholder="Optional" />
                  </FormControl>
                  <FormDescription>Useful when raising purchase orders.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDialog>

      <ConfirmDialog
        open={categoryTarget.isOpen}
        onOpenChange={categoryTarget.onOpenChange}
        title="Delete this category?"
        description={
          <>
            <strong>{categoryTarget.target?.name}</strong> will be removed. This is only possible
            while no titles are assigned to it.
          </>
        }
        confirmLabel="Delete category"
        variant="destructive"
        onConfirm={async () => {
          if (categoryTarget.target) {
            await categoryMutations.deleteMutation.mutateAsync(categoryTarget.target.id);
          }
        }}
      />

      <ConfirmDialog
        open={shelfTarget.isOpen}
        onOpenChange={shelfTarget.onOpenChange}
        title="Delete this shelf?"
        description={
          <>
            <strong>{shelfTarget.target?.code}</strong> will be removed. This is only possible while
            no copies are shelved there.
          </>
        }
        confirmLabel="Delete shelf"
        variant="destructive"
        onConfirm={async () => {
          if (shelfTarget.target) {
            await shelfMutations.deleteMutation.mutateAsync(shelfTarget.target.id);
          }
        }}
      />
    </>
  );
}

interface TaxonomyRow {
  id: string;
  primary: string;
  secondary: string;
  onDelete?: () => void;
}

interface TaxonomyCardProps {
  title: string;
  description: string;
  rows: TaxonomyRow[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  emptyLabel: string;
  addLabel: string;
  onAdd?: () => void;
}

function TaxonomyCard({
  title,
  description,
  rows,
  isLoading,
  error,
  onRetry,
  emptyLabel,
  addLabel,
  onAdd,
}: TaxonomyCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {onAdd && (
            <Button variant="outline" size="sm" onClick={onAdd}>
              <Plus className="size-4" aria-hidden />
              {addLabel}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} size="compact" />
        ) : rows.length === 0 ? (
          <EmptyState title={emptyLabel} size="compact" />
        ) : (
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.primary}</p>
                  {row.secondary && (
                    <p className="text-muted-foreground truncate text-xs">{row.secondary}</p>
                  )}
                </div>
                {row.onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-8"
                    aria-label={`Delete ${row.primary}`}
                    onClick={row.onDelete}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
