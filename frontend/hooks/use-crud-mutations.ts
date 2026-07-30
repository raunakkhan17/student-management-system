'use client';

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';

interface CrudOptions<TCreate, TUpdate, TResult> {
  /** Query key prefix to invalidate after a successful write. */
  queryKey: QueryKey;
  /** Singular, lowercase entity name used in toasts, e.g. "department". */
  entityName: string;
  create?: (payload: TCreate) => Promise<TResult>;
  update?: (id: string, payload: TUpdate) => Promise<TResult>;
  remove?: (id: string) => Promise<unknown>;
  onSuccess?: () => void;
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Wires create/update/delete to TanStack Query with consistent toasts and
 * cache invalidation, so every module behaves identically.
 *
 * Field-level errors are re-thrown for the form to map onto inputs; only
 * non-field failures are surfaced as toasts.
 */
export function useCrudMutations<TCreate, TUpdate, TResult>({
  queryKey,
  entityName,
  create,
  update,
  remove,
  onSuccess,
}: CrudOptions<TCreate, TUpdate, TResult>) {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
    onSuccess?.();
  };

  const createMutation = useMutation({
    mutationFn: (payload: TCreate) => {
      if (!create) throw new Error('Create is not supported for this resource');
      return create(payload);
    },
    onSuccess: async () => {
      toast.success(`The ${entityName} was created`);
      await invalidate();
    },
    onError: (error) => {
      // Field errors are shown inline by the form; only report the rest.
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(describeError(error, `Could not create the ${entityName}`));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TUpdate }) => {
      if (!update) throw new Error('Update is not supported for this resource');
      return update(id, payload);
    },
    onSuccess: async () => {
      toast.success(`The ${entityName} was updated`);
      await invalidate();
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) return;
      toast.error(describeError(error, `Could not update the ${entityName}`));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (!remove) throw new Error('Delete is not supported for this resource');
      return remove(id);
    },
    onSuccess: async () => {
      toast.success(`The ${entityName} was removed`);
      await invalidate();
    },
    onError: (error) => {
      toast.error(describeError(error, `Could not remove the ${entityName}`));
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
    isMutating:
      createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
