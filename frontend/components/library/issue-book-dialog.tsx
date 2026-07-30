'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AsyncCombobox } from '@/components/common/async-combobox';
import { FormDialog } from '@/components/common/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api-client';
import { applyApiErrors } from '@/lib/form-errors';
import { libraryService } from '@/services/library.service';
import type { Book, LibraryMember } from '@/types/library';
import { MemberPicker } from './member-picker';

const FORM_ID = 'issue-book-form';

const issueFormSchema = z.object({
  memberId: z.string().uuid('Select a member'),
  bookId: z.string().uuid('Select a title'),
  dueDate: z.string().optional(),
  remarks: z.string().trim().max(300).optional(),
});

type IssueFormValues = z.infer<typeof issueFormSchema>;

interface IssueBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Issue desk. A title is chosen rather than a specific copy — the server picks
 * an available copy, which keeps the counter staff from hunting accession numbers.
 */
export function IssueBookDialog({ open, onOpenChange }: IssueBookDialogProps) {
  const queryClient = useQueryClient();
  // Kept only to show the borrowing-limit hint; the picker remembers its own label.
  const [pickedMember, setPickedMember] = useState<LibraryMember | null>(null);

  const settings = useQuery({
    queryKey: ['library', 'settings'],
    queryFn: () => libraryService.getSettings(),
    enabled: open,
  });

  const form = useForm<IssueFormValues>({
    resolver: zodResolver(issueFormSchema),
    defaultValues: { memberId: '', bookId: '', dueDate: '', remarks: '' },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({ memberId: '', bookId: '', dueDate: '', remarks: '' });
  }, [open, form]);

  const mutation = useMutation({
    mutationFn: (values: IssueFormValues) =>
      libraryService.issueBook({
        memberId: values.memberId,
        bookId: values.bookId,
        ...(values.dueDate ? { dueDate: values.dueDate } : {}),
        ...(values.remarks ? { remarks: values.remarks } : {}),
      }),
    onSuccess: async (loan) => {
      toast.success(
        `"${loan.bookCopy.book.title}" issued — due ${loan.dueDate.slice(0, 10)} (copy ${loan.bookCopy.accessionNumber})`,
      );
      await queryClient.invalidateQueries({ queryKey: ['library'] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not issue the book');
    },
  });

  const onSubmit = async (values: IssueFormValues) => {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyApiErrors(error, form.setError, ['memberId', 'bookId', 'dueDate', 'remarks']);
    }
  };

  const limit = settings.data?.maxBooksPerMember;
  const memberId = form.watch('memberId');
  // A remembered member from a previous open no longer matches the form value.
  const member = pickedMember?.id === memberId ? pickedMember : null;
  const atLimit = member !== null && limit !== undefined && member.onLoan >= limit;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Issue a book"
      description="Pick the borrower and the title. The library allocates an available copy."
      formId={FORM_ID}
      isSubmitting={form.formState.isSubmitting}
      submitLabel="Issue book"
    >
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="memberId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Member</FormLabel>
                <FormControl>
                  <MemberPicker
                    value={field.value || null}
                    onChange={(id, picked) => {
                      field.onChange(id ?? '');
                      setPickedMember(picked);
                    }}
                  />
                </FormControl>
                {member && limit !== undefined && (
                  <FormDescription>
                    {member.onLoan} of {limit} book(s) currently out.
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          {atLimit && (
            <Alert variant="destructive">
              <AlertDescription>
                This member has reached the borrowing limit. A book must be returned first.
              </AlertDescription>
            </Alert>
          )}

          <FormField
            control={form.control}
            name="bookId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <AsyncCombobox<Book>
                    value={field.value || null}
                    onChange={(id) => field.onChange(id ?? '')}
                    queryKey={['library', 'books', 'picker']}
                    fetcher={(search) =>
                      libraryService
                        .listBooks({
                          limit: 20,
                          onlyAvailable: true,
                          ...(search ? { search } : {}),
                        })
                        .then((page) => page.items)
                    }
                    getId={(item) => item.id}
                    getLabel={(item) => item.title}
                    getDescription={(item) =>
                      `${item.isbn} · ${item.availableCopies} of ${item.totalCopies} available`
                    }
                    placeholder="Search the catalogue…"
                    searchPlaceholder="Title, ISBN or author…"
                    emptyMessage="No titles with a copy on the shelf."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dueDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Due date</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormDescription>
                  {settings.data
                    ? `Leave blank for the standard ${settings.data.maxIssueDays}-day loan.`
                    : 'Leave blank for the standard loan period.'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="remarks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Remarks</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} placeholder="Optional note for the loan record" />
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
