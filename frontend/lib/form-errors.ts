import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '@/lib/api-client';

/**
 * Maps server-side field errors onto a react-hook-form instance.
 * Returns the message that should be shown at form level (if any), so the
 * caller can decide between an inline alert and a toast.
 */
export function applyApiErrors<TValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TValues>,
  knownFields: readonly Path<TValues>[],
): string {
  if (!(error instanceof ApiError)) {
    return 'Something went wrong. Please try again.';
  }

  const fieldErrors = error.fieldErrors;
  let matched = false;

  for (const field of knownFields) {
    const message = fieldErrors[field as string];
    if (message) {
      setError(field, { type: 'server', message });
      matched = true;
    }
  }

  // Field errors are already visible inline; only surface the summary when
  // nothing could be attached to a specific input.
  return matched ? '' : error.message;
}
