import {
  BarChart3,
  BookMarked,
  Bus,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Home,
  LayoutDashboard,
  Library,
  MessagesSquare,
  Megaphone,
  NotebookPen,
  ReceiptIndianRupee,
  ScrollText,
  Settings,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { AppModule } from '@/types/enums';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** The module whose VIEW permission gates this entry. */
  module: AppModule;
}

export interface NavSection {
  /** Omitted for the first, unlabelled group. */
  label?: string;
  items: NavItem[];
}

/**
 * Sidebar structure, ordered by PRD module number within each group.
 * Entries are filtered per user against the permission matrix, so each role
 * sees only the modules it can actually open.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, module: 'DASHBOARD' }],
  },
  {
    label: 'People',
    items: [
      { label: 'Students', href: '/students', icon: GraduationCap, module: 'STUDENTS' },
      { label: 'Teachers', href: '/teachers', icon: UsersRound, module: 'TEACHERS' },
    ],
  },
  {
    label: 'Academics',
    items: [
      { label: 'Academic setup', href: '/academics', icon: BookMarked, module: 'ACADEMICS' },
      { label: 'Attendance', href: '/attendance', icon: ClipboardCheck, module: 'ATTENDANCE' },
      { label: 'Timetable', href: '/timetable', icon: CalendarClock, module: 'TIMETABLE' },
      { label: 'Assignments', href: '/assignments', icon: NotebookPen, module: 'ASSIGNMENTS' },
      { label: 'Examinations', href: '/exams', icon: ScrollText, module: 'EXAMS' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Fees', href: '/fees', icon: ReceiptIndianRupee, module: 'FEES' },
      { label: 'Library', href: '/library', icon: Library, module: 'LIBRARY' },
      { label: 'Hostel', href: '/hostel', icon: Home, module: 'HOSTEL' },
      { label: 'Transport', href: '/transport', icon: Bus, module: 'TRANSPORT' },
      { label: 'Leave', href: '/leave', icon: CalendarDays, module: 'LEAVE' },
    ],
  },
  {
    label: 'Communication',
    items: [
      { label: 'Notices', href: '/notices', icon: Megaphone, module: 'NOTICES' },
      { label: 'Messages', href: '/messages', icon: MessagesSquare, module: 'COMMUNICATION' },
      { label: 'Documents', href: '/documents', icon: FileText, module: 'DOCUMENTS' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Reports', href: '/reports', icon: BarChart3, module: 'REPORTS' },
      { label: 'Audit log', href: '/audit-logs', icon: ScrollText, module: 'AUDIT_LOGS' },
      { label: 'Settings', href: '/settings', icon: Settings, module: 'SETTINGS' },
    ],
  },
];

/** True when `pathname` is the nav item's route or a descendant of it. */
export function isRouteActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Removes entries and empty sections the user cannot view. */
export function filterNavigation(
  sections: NavSection[],
  canView: (module: AppModule) => boolean,
): NavSection[] {
  return sections
    .map((section) => ({ ...section, items: section.items.filter((item) => canView(item.module)) }))
    .filter((section) => section.items.length > 0);
}
