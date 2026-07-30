'use client';

import { AsyncCombobox } from '@/components/common/async-combobox';
import { messageService } from '@/services/message.service';
import { ROLE_LABELS, type UserRole } from '@/types/enums';
import type { RecipientOption } from '@/types/message';

interface UserPickerProps {
  value: string | null;
  onChange: (userId: string | null, user: RecipientOption | null) => void;
  /** Narrows the search to one role, e.g. staff only. */
  role?: UserRole;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  /** Label for the "no selection" entry when `clearable`. */
  clearLabel?: string;
}

/**
 * Server-searched people picker.
 *
 * Backed by the messaging recipient endpoint, which already applies the rule
 * that students and parents may only reach staff.
 */
export function UserPicker({
  value,
  onChange,
  role,
  placeholder = 'Search for a person…',
  disabled = false,
  clearable = false,
  clearLabel,
}: UserPickerProps) {
  return (
    <AsyncCombobox<RecipientOption>
      value={value}
      onChange={onChange}
      queryKey={['messages', 'recipients', role ?? null]}
      fetcher={(search) =>
        messageService.listRecipients({
          ...(search ? { search } : {}),
          ...(role ? { role } : {}),
        })
      }
      getId={(person) => person.id}
      getLabel={(person) => `${person.firstName} ${person.lastName}`}
      getDescription={(person) =>
        [person.identifier, ROLE_LABELS[person.role]].filter(Boolean).join(' · ')
      }
      placeholder={placeholder}
      searchPlaceholder="Name or email…"
      emptyMessage="No matching people."
      disabled={disabled}
      clearable={clearable}
      {...(clearLabel !== undefined ? { clearLabel } : {})}
    />
  );
}
