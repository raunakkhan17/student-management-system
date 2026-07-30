'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormDialog } from '@/components/common/form-dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCrudMutations } from '@/hooks/use-crud-mutations';
import { applyApiErrors } from '@/lib/form-errors';
import { libraryService } from '@/services/library.service';
import type { Book, BookPayload } from '@/types/library';

const NONE = '__none__';
const FORM_ID = 'book-form';
const QUERY_KEY = ['library', 'books'] as const;

const bookFormSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300),
  isbn: z
    .string()
    .trim()
    .refine((value) => /^(\d{9}[\dXx]|\d{13})$/.test(value.replace(/[\s-]/g, '')), {
      message: 'Enter a valid 10- or 13-digit ISBN',
    }),
  categoryId: z.string().uuid('Select a category'),
  publisherId: z.string().optional(),
  /** Comma-separated so a librarian can type authors without pre-creating them. */
  authorNames: z.string().trim().max(600).optional(),
  edition: z.string().trim().max(60).optional(),
  publishYear: z.string().trim().optional(),
  language: z.string().trim().min(1, 'Language is required').max(60),
  pages: z.string().trim().optional(),
  description: z.string().trim().max(2000).optional(),
});

type BookFormValues = z.infer<typeof bookFormSchema>;

const EMPTY: BookFormValues = {
  title: '',
  isbn: '',
  categoryId: '',
  publisherId: NONE,
  authorNames: '',
  edition: '',
  publishYear: '',
  language: 'English',
  pages: '',
  description: '',
};

interface BookFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null opens the dialog in create mode. */
  book: Book | null;
}

function toNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function BookFormDialog({ open, onOpenChange, book }: BookFormDialogProps) {
  const categories = useQuery({
    queryKey: ['library', 'categories', 'all'],
    queryFn: () => libraryService.listCategories({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
    enabled: open,
  });

  const publishers = useQuery({
    queryKey: ['library', 'publishers', 'all'],
    queryFn: () => libraryService.listPublishers({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
    enabled: open,
  });

  const { createMutation, updateMutation } = useCrudMutations<
    BookPayload,
    Partial<Omit<BookPayload, 'isbn'>>,
    Book
  >({
    queryKey: QUERY_KEY,
    entityName: 'book',
    create: libraryService.createBook,
    update: libraryService.updateBook,
    onSuccess: () => onOpenChange(false),
  });

  const form = useForm<BookFormValues>({
    resolver: zodResolver(bookFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      book
        ? {
            title: book.title,
            isbn: book.isbn,
            categoryId: book.categoryId,
            publisherId: book.publisherId ?? NONE,
            authorNames: book.authors.map((link) => link.author.name).join(', '),
            edition: book.edition ?? '',
            publishYear: book.publishYear ? String(book.publishYear) : '',
            language: book.language,
            pages: book.pages ? String(book.pages) : '',
            description: book.description ?? '',
          }
        : EMPTY,
    );
  }, [open, book, form]);

  const onSubmit = async (values: BookFormValues) => {
    const authorNames = (values.authorNames ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    const publishYear = toNumber(values.publishYear);
    const pages = toNumber(values.pages);

    const payload: BookPayload = {
      title: values.title,
      isbn: values.isbn.replace(/[\s-]/g, ''),
      categoryId: values.categoryId,
      publisherId: values.publisherId === NONE ? null : (values.publisherId ?? null),
      authorIds: [],
      authorNames,
      language: values.language,
      ...(values.edition ? { edition: values.edition } : {}),
      ...(publishYear !== undefined ? { publishYear } : {}),
      ...(pages !== undefined ? { pages } : {}),
      ...(values.description ? { description: values.description } : {}),
    };

    try {
      if (book) {
        // The ISBN identifies the title, so it is fixed once catalogued.
        const { isbn: _isbn, ...rest } = payload;
        await updateMutation.mutateAsync({ id: book.id, payload: rest });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, [
        'title',
        'isbn',
        'categoryId',
        'publisherId',
        'edition',
        'publishYear',
        'language',
        'pages',
        'description',
      ]);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={book ? 'Edit title' : 'Catalogue a title'}
      description={
        book
          ? 'Update the bibliographic details. The ISBN cannot be changed.'
          : 'Register a new title. Physical copies are added separately.'
      }
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel={book ? 'Save changes' : 'Catalogue title'}
      size="lg"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Introduction to Algorithms" autoFocus />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="isbn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ISBN</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="9780262033848" disabled={Boolean(book)} />
                  </FormControl>
                  <FormDescription>10 or 13 digits; hyphens are ignored.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(categories.data?.items ?? []).map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name} · {category.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="authorNames"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Authors</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Thomas H. Cormen, Charles E. Leiserson" />
                </FormControl>
                <FormDescription>
                  Separate names with commas. Unknown names are added to the author list.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="publisherId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Publisher</FormLabel>
                  <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Not recorded" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Not recorded</SelectItem>
                      {(publishers.data?.items ?? []).map((publisher) => (
                        <SelectItem key={publisher.id} value={publisher.id}>
                          {publisher.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="edition"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Edition</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="3rd" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="language"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Language</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="English" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="publishYear"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Year</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="numeric" placeholder="2009" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pages"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pages</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="numeric" placeholder="1312" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} placeholder="Optional summary or notes" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FormDialog>
  );
}
