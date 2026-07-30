'use client';

import type { Control, FieldValues, Path } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

interface AddressFieldsProps<TValues extends FieldValues> {
  control: Control<TValues>;
  /** Dotted prefix, e.g. `permanentAddress`. */
  prefix: string;
  disabled?: boolean;
}

/** Reused for permanent, current, guardian and staff addresses. */
export function AddressFields<TValues extends FieldValues>({
  control,
  prefix,
  disabled = false,
}: AddressFieldsProps<TValues>) {
  const path = (field: string) => `${prefix}.${field}` as Path<TValues>;

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <FormField
        control={control}
        name={path('line1')}
        render={({ field }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>Address line 1</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} disabled={disabled} placeholder="House / street" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={path('line2')}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Address line 2</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} disabled={disabled} placeholder="Area" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={path('landmark')}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Landmark</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} disabled={disabled} placeholder="Near…" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={path('city')}
        render={({ field }) => (
          <FormItem>
            <FormLabel>City</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} disabled={disabled} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={path('state')}
        render={({ field }) => (
          <FormItem>
            <FormLabel>State</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} disabled={disabled} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={path('country')}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Country</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} disabled={disabled} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={path('postalCode')}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Postal code</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} disabled={disabled} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
