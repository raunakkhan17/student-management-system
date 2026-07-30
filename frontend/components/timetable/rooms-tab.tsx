'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { DoorOpen, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog, useConfirmTarget } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
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
  Form,
  FormControl,
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
import { useAuth } from '@/hooks/use-auth';
import { useCrudMutations } from '@/hooks/use-crud-mutations';
import { useTableState } from '@/hooks/use-table-state';
import { applyApiErrors } from '@/lib/form-errors';
import { timetableService } from '@/services/timetable.service';
import { ROOM_TYPE_LABELS, type Room, type RoomPayload, type RoomType } from '@/types/timetable';

const ALL = '__all__';
const FORM_ID = 'room-form';
const QUERY_KEY = ['timetable', 'rooms'] as const;

const ROOM_TYPES: RoomType[] = [
  'CLASSROOM',
  'LABORATORY',
  'AUDITORIUM',
  'SEMINAR_HALL',
  'LIBRARY',
  'SPORTS',
];

const formSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and dashes only'),
  type: z.enum(['CLASSROOM', 'LABORATORY', 'AUDITORIUM', 'SEMINAR_HALL', 'LIBRARY', 'SPORTS']),
  capacity: z.coerce.number().int().min(1).max(1000),
  building: z.string().trim().max(80).optional(),
  floor: z.string().trim().max(40).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function RoomsTab() {
  const { can } = useAuth();
  const table = useTableState({ defaultSortBy: 'name', defaultSortOrder: 'asc' });
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [editing, setEditing] = useState<Room | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const deleteTarget = useConfirmTarget<Room>();

  const params = {
    ...table.queryParams,
    ...(typeFilter !== ALL ? { type: typeFilter as RoomType } : {}),
  };

  const query = useQuery({
    queryKey: [...QUERY_KEY, params],
    queryFn: () => timetableService.listRooms(params),
  });

  const { createMutation, updateMutation, deleteMutation } = useCrudMutations<
    RoomPayload,
    Partial<RoomPayload>,
    Room
  >({
    queryKey: QUERY_KEY,
    entityName: 'room',
    create: timetableService.createRoom,
    update: timetableService.updateRoom,
    remove: timetableService.deleteRoom,
    onSuccess: () => setIsFormOpen(false),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      code: '',
      type: 'CLASSROOM',
      capacity: 40,
      building: '',
      floor: '',
    },
  });

  useEffect(() => {
    if (!isFormOpen) return;
    form.reset(
      editing
        ? {
            name: editing.name,
            code: editing.code,
            type: editing.type,
            capacity: editing.capacity,
            building: editing.building ?? '',
            floor: editing.floor ?? '',
          }
        : { name: '', code: '', type: 'CLASSROOM', capacity: 40, building: '', floor: '' },
    );
  }, [isFormOpen, editing, form]);

  const onSubmit = async (values: FormValues) => {
    const payload: RoomPayload = {
      name: values.name,
      code: values.code.toUpperCase(),
      type: values.type,
      capacity: values.capacity,
      ...(values.building ? { building: values.building } : {}),
      ...(values.floor ? { floor: values.floor } : {}),
    };

    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (error) {
      applyApiErrors(error, form.setError, ['name', 'code', 'type', 'capacity']);
    }
  };

  const columns: ColumnDef<Room, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Room',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="text-muted-foreground truncate text-sm">{row.original.code}</p>
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Type',
      meta: { sortKey: 'type' },
      cell: ({ row }) => <Badge variant="secondary">{ROOM_TYPE_LABELS[row.original.type]}</Badge>,
    },
    {
      accessorKey: 'capacity',
      header: 'Capacity',
      meta: { sortKey: 'capacity', cellClassName: 'tabular-nums' },
      cell: ({ row }) => row.original.capacity,
    },
    {
      id: 'location',
      header: 'Location',
      meta: { hideOnMobile: true },
      cell: ({ row }) => {
        const parts = [row.original.building, row.original.floor].filter(Boolean);
        return parts.length > 0 ? (
          parts.join(' · ')
        ) : (
          <span className="text-muted-foreground">—</span>
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
            <Button variant="ghost" size="icon" className="size-8" aria-label="Row actions">
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {can('TIMETABLE', 'EDIT') && (
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
            {can('TIMETABLE', 'DELETE') && (
              <DropdownMenuItem variant="destructive" onClick={() => deleteTarget.open(row.original)}>
                <Trash2 className="size-4" aria-hidden />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

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
        toolbar={
          <DataTableToolbar
            search={table.state.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Search rooms and labs…"
            isFiltered={table.state.search.length > 0 || typeFilter !== ALL}
            onReset={() => {
              table.reset();
              setTypeFilter(ALL);
            }}
            filters={
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[11rem]" aria-label="Filter by type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  {ROOM_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {ROOM_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            actions={
              can('TIMETABLE', 'CREATE') && (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setIsFormOpen(true);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Add room
                </Button>
              )
            }
          />
        }
        emptyState={
          <EmptyState
            icon={DoorOpen}
            title="No rooms yet"
            description="Add classrooms and labs so timetable slots and exams can be allocated a location."
          />
        }
      />

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit room' : 'Add a room'}
        formId={FORM_ID}
        isSubmitting={form.formState.isSubmitting}
        submitLabel={editing ? 'Save changes' : 'Add room'}
      >
        <Form {...form}>
          <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Physics Lab 1" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="LAB-01"
                        className="uppercase"
                        onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacity</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} max={1000} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROOM_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {ROOM_TYPE_LABELS[type]}
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
                name="building"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Building</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Science Block" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="floor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Floor</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ground" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </FormDialog>

      <ConfirmDialog
        open={deleteTarget.isOpen}
        onOpenChange={deleteTarget.onOpenChange}
        title="Delete this room?"
        description={
          <>
            <strong>{deleteTarget.target?.name}</strong> will be removed. This is only possible while
            it is not allocated to timetable slots, exams or sections.
          </>
        }
        confirmLabel="Delete room"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget.target) await deleteMutation.mutateAsync(deleteTarget.target.id);
        }}
      />
    </>
  );
}
