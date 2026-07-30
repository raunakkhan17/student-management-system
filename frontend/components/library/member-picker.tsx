'use client';

import { AsyncCombobox } from '@/components/common/async-combobox';
import { libraryService } from '@/services/library.service';
import { ROLE_LABELS } from '@/types/enums';
import type { LibraryMember } from '@/types/library';

interface MemberPickerProps {
  value: string | null;
  onChange: (memberId: string | null, member: LibraryMember | null) => void;
  selectedLabel?: string | null;
  disabled?: boolean;
}

/** Finds a borrower by name, email, admission number or employee id. */
export function MemberPicker({ value, onChange, selectedLabel, disabled }: MemberPickerProps) {
  return (
    <AsyncCombobox<LibraryMember>
      value={value}
      onChange={onChange}
      queryKey={['library', 'members']}
      fetcher={(search) => libraryService.searchMembers(search || undefined)}
      getId={(member) => member.id}
      getLabel={(member) => `${member.firstName} ${member.lastName}`}
      getDescription={(member) =>
        [
          member.identifier,
          member.className,
          ROLE_LABELS[member.role],
          `${member.onLoan} on loan`,
        ]
          .filter(Boolean)
          .join(' · ')
      }
      {...(selectedLabel !== undefined ? { selectedLabel } : {})}
      placeholder="Search for a member…"
      searchPlaceholder="Name, email or ID…"
      emptyMessage="No members found."
      {...(disabled !== undefined ? { disabled } : {})}
    />
  );
}
