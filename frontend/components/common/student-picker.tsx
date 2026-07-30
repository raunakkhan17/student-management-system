'use client';

import { studentService } from '@/services/student.service';
import type { StudentListItem } from '@/types/student';
import { AsyncCombobox } from './async-combobox';

interface StudentPickerProps {
  value: string | null;
  onChange: (studentId: string | null, student: StudentListItem | null) => void;
  /** Narrows the search, e.g. to one class on a hostel allocation form. */
  classId?: string;
  /** Shown on the trigger before the search results have loaded. */
  selectedLabel?: string | null;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
}

/** Server-searched student selector, shared by every module that assigns a student. */
export function StudentPicker({
  value,
  onChange,
  classId,
  selectedLabel,
  placeholder = 'Search for a student…',
  disabled = false,
  clearable = false,
}: StudentPickerProps) {
  return (
    <AsyncCombobox<StudentListItem>
      value={value}
      onChange={onChange}
      queryKey={['students', 'picker', classId ?? null]}
      fetcher={(search) =>
        studentService
          .list({
            limit: 20,
            status: 'ACTIVE',
            ...(search ? { search } : {}),
            ...(classId ? { classId } : {}),
          })
          .then((page) => page.items)
      }
      getId={(student) => student.id}
      getLabel={(student) => `${student.user.firstName} ${student.user.lastName}`}
      getDescription={(student) =>
        [student.admissionNumber, student.class?.name, student.section?.name]
          .filter(Boolean)
          .join(' · ')
      }
      {...(selectedLabel !== undefined ? { selectedLabel } : {})}
      placeholder={placeholder}
      searchPlaceholder="Name or admission number…"
      emptyMessage="No students found."
      disabled={disabled}
      clearable={clearable}
    />
  );
}
