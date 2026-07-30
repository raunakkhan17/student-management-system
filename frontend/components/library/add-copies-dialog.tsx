'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { ApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/form-errors';
import { libraryService } from '@/services/library.service';
import { BOOK_CONDITION_LABELS, type Book, type BookCondition } from '@/types/library';

const NONE = '__none__';
const FORM_ID = 'add-copies-form';

const CONDITIONS: BookCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR'];

const addCopiesFormSchema = z.object({
  count: z.coerce.number().int().min(1, 'Add at least one copy').max(100),
  shelfId: z.string().optional(),
  condition: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR']),
  purchaseDate: z.string().optional(),
  price: z.string().optional(),
});

type AddCopiesFormValues = z.infer<typeof addCopiesFormSchema>;

interface AddCopiesDialogProps {
  book: Book | null;
  onOpenChange: (open: boolean) => void;
}

/** Registers physical copies; accession numbers are allocated by the server. */
export function AddCopiesDialog({ book, onOpenChange }: AddCopiesDialogProps) {
  const queryClient = useQueryClient();
  const isOpen = book !== null;

  const shelves = useQuery({
    queryKey: ['library', 'shelves', 'all'],
    queryFn: () => libraryService.listShelves({ limit: 100, sortBy: 'code', sortOrder: 'asc' }),
    enabled: isOpen,
  });

  const form = useForm<AddCopiesFormValues>({
    resolver: zodResolver(addCopiesFormSchema),
    defaultValues: { count: 1, shelfId: NONE, condition: 'NEW', purchaseDate: '', price: '' },
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset({ count: 1, shelfId: NONE, condition: 'NEW', purchaseDate: '', price: '' });
  }, [isOpen, form]);

  const mutation = useMutation({
    mutationFn: (values: AddCopiesFormValues) => {
      if (!book) throw new Error('No title selected');
      const price = values.price?.trim() ? Number(values.price) : undefined;

      return libraryService.addCopies(book.id, {
        count: values.count,
        accessionNumbers: [],
        shelfId: values.shelfId === NONE ? null : (values.shelfId ?? null),
        condition: values.condition,
        ...(values.purchaseDate ? { purchaseDate: values.purchaseDate } : {}),
        ...(price !== undefined && Number.isFinite(price) ? { price } : {}),
      });
    },
    onSuccess: async (updated) => {
      toast.success(`${updated.title} now has ${updated.totalCopies} copy(ies)`);
      await queryClient.invalidateQueries({ queryKey: ['library'] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not register the copies');
    },
  });

  const onSubmit = async (values: AddCopiesFormValues) => {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyApiErrors(error, form.setError, ['count', 'shelfId', 'condition', 'purchaseDate', 'price']);
    }
  };

  return (
    <FormDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      title="Register copies"
      description={book ? `Adding physical copies of "${book.title}".` : undefined}
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel="Register copies"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="count"
            render={({ field }) => (
              <FormItem>
                <FormLabel>How many copies</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min={1} max={100} autoFocus />
                </FormControl>
                <FormDescription>
                  Accession numbers are assigned automatically in a contiguous block.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="shelfId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shelf</FormLabel>
                  <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Unshelved" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Unshelved</SelectItem>
                      {(shelves.data?.items ?? []).map((shelf) => (
                        <SelectItem key={shelf.id} value={shelf.id}>
                          {shelf.code} · {shelf.name}
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
              name="condition"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condition</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CONDITIONS.map((condition) => (
                        <SelectItem key={condition} value={condition}>
                          {BOOK_CONDITION_LABELS[condition]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="purchaseDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purchase date</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price per copy</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="decimal" placeholder="0.00" />
                  </FormControl>
                  <FormDescription>Used to charge replacement cost for a lost copy.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </form>
      </Form>
    </FormDialog>
  );
}
