import type { ListQueryParams } from './api';
import type { SubjectType } from './academic';

export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export type RoomType =
  | 'CLASSROOM'
  | 'LABORATORY'
  | 'AUDITORIUM'
  | 'SEMINAR_HALL'
  | 'LIBRARY'
  | 'SPORTS';

export type SlotType =
  | 'LECTURE'
  | 'LAB'
  | 'TUTORIAL'
  | 'BREAK'
  | 'ASSEMBLY'
  | 'SPORTS'
  | 'LIBRARY';

/** Weekdays shown as grid columns. Sunday is omitted by default. */
export const WEEK_DAYS: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

export const DAY_SHORT: Record<DayOfWeek, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
};

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  CLASSROOM: 'Classroom',
  LABORATORY: 'Laboratory',
  AUDITORIUM: 'Auditorium',
  SEMINAR_HALL: 'Seminar hall',
  LIBRARY: 'Library',
  SPORTS: 'Sports',
};

export const SLOT_TYPE_LABELS: Record<SlotType, string> = {
  LECTURE: 'Lecture',
  LAB: 'Lab',
  TUTORIAL: 'Tutorial',
  BREAK: 'Break',
  ASSEMBLY: 'Assembly',
  SPORTS: 'Sports',
  LIBRARY: 'Library',
};

export interface Room {
  id: string;
  name: string;
  code: string;
  type: RoomType;
  capacity: number;
  building: string | null;
  floor: string | null;
}

export interface RoomOption {
  id: string;
  name: string;
  code: string;
  type: RoomType;
  capacity: number;
}

export interface TimetablePeriod {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isBreak: boolean;
}

export interface TimetableSlot {
  id: string;
  dayOfWeek: DayOfWeek;
  periodId: string;
  classSubjectId: string | null;
  teacherId: string | null;
  roomId: string | null;
  type: SlotType;
  note: string | null;
  period: TimetablePeriod;
  room: { id: string; name: string; code: string; type: RoomType } | null;
  teacher: {
    id: string;
    employeeId: string;
    user: { firstName: string; lastName: string };
  } | null;
  classSubject: {
    id: string;
    isElective: boolean;
    subject: { id: string; name: string; code: string; type: SubjectType };
  } | null;
}

export interface Timetable {
  id: string;
  name: string;
  classId: string;
  sectionId: string;
  academicYearId: string;
  semesterId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  class: { id: string; name: string; code: string };
  section: { id: string; name: string };
  academicYear: { id: string; name: string };
  semester: { id: string; name: string } | null;
  slots: TimetableSlot[];
}

export interface TimetableListItem {
  id: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  class: { id: string; name: string };
  section: { id: string; name: string };
  academicYear: { id: string; name: string };
  semester: { id: string; name: string } | null;
  _count: { slots: number };
}

/** One entry in a teacher's personal week view. */
export interface TeacherTimetableSlot {
  id: string;
  dayOfWeek: DayOfWeek;
  type: SlotType;
  note: string | null;
  period: { id: string; name: string; startTime: string; endTime: string; sortOrder: number };
  room: { id: string; name: string; code: string } | null;
  classSubject: { subject: { id: string; name: string; code: string } } | null;
  timetable: {
    class: { id: string; name: string };
    section: { id: string; name: string };
  };
}

export interface ConflictDetail {
  index: number;
  kind: 'TEACHER' | 'ROOM' | 'DUPLICATE_CELL';
  message: string;
}

export interface ConflictCheckResult {
  hasConflicts: boolean;
  conflicts: ConflictDetail[];
}

export interface SlotPayload {
  dayOfWeek: DayOfWeek;
  periodId: string;
  classSubjectId?: string | null;
  teacherId?: string | null;
  roomId?: string | null;
  type: SlotType;
  note?: string;
}

export interface TimetablePayload {
  name: string;
  classId: string;
  sectionId: string;
  academicYearId: string;
  semesterId?: string | null;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive: boolean;
}

export interface RoomPayload {
  name: string;
  code: string;
  type: RoomType;
  capacity: number;
  building?: string;
  floor?: string;
}

export interface PeriodPayload {
  name: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isBreak: boolean;
}

export interface TimetableQuery extends ListQueryParams {
  classId?: string;
  sectionId?: string;
  academicYearId?: string;
  isActive?: boolean;
}
