'use client';

import { teacherService } from '@/services/teacher.service';
import type { TeacherListItem } from '@/types/teacher';
import { AsyncCombobox } from './async-combobox';

interface TeacherPickerProps {
  value: string | null;
  onChange: (teacherId: string | null, teacher: TeacherListItem | null) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
}

/**
 * Server-searched staff selector, keyed by the *teacher profile* id.
 *
 * Distinct from `UserPicker`, which returns a user id — anything attached to a
 * staff record (documents, departments) needs the profile id, not the login.
 */
export function TeacherPicker({
  value,
  onChange,
  placeholder = 'Search for a member of staff…',
  disabled = false,
  clearable = false,
}: TeacherPickerProps) {
  return (
    <AsyncCombobox<TeacherListItem>
      value={value}
      onChange={onChange}
      queryKey={['teachers', 'picker']}
      fetcher={(search) =>
        teacherService
          .list({ limit: 20, status: 'ACTIVE', ...(search ? { search } : {}) })
          .then((page) => page.items)
      }
      getId={(teacher) => teacher.id}
      getLabel={(teacher) => `${teacher.user.firstName} ${teacher.user.lastName}`}
      getDescription={(teacher) =>
        [teacher.employeeId, teacher.designation, teacher.department?.name]
          .filter(Boolean)
          .join(' · ')
      }
      placeholder={placeholder}
      searchPlaceholder="Name or employee id…"
      emptyMessage="No staff found."
      disabled={disabled}
      clearable={clearable}
    />
  );
}
