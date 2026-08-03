import {
  AppModule,
  PermissionAction,
  PrismaClient,
  UserRole,
  type Prisma,
} from '@prisma/client';
import { hashPassword } from '../utils/password';

const prisma = new PrismaClient();

const ALL_ACTIONS = Object.values(PermissionAction);
const READ_ONLY: PermissionAction[] = ['VIEW'];
const READ_EXPORT: PermissionAction[] = ['VIEW', 'EXPORT'];
const MANAGE: PermissionAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT'];
const MANAGE_ASSIGN: PermissionAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT', 'ASSIGN'];

type RoleMatrix = Partial<Record<AppModule, PermissionAction[]>>;

/**
 * Default permission matrix, derived from PRD §5 (Access column) and §10.
 * Administrators can change any of this at runtime from Settings — these are
 * only the starting grants.
 */
const DEFAULT_MATRIX: Record<Exclude<UserRole, 'SUPER_ADMIN'>, RoleMatrix> = {
  // Institution-wide administration.
  ADMIN: {
    DASHBOARD: READ_ONLY,
    USERS: MANAGE_ASSIGN,
    STUDENTS: [...MANAGE_ASSIGN, 'APPROVE'],
    TEACHERS: [...MANAGE_ASSIGN, 'APPROVE'],
    ACADEMICS: MANAGE_ASSIGN,
    ATTENDANCE: [...MANAGE, 'APPROVE'],
    EXAMS: [...MANAGE_ASSIGN, 'APPROVE'],
    ASSIGNMENTS: MANAGE,
    TIMETABLE: MANAGE_ASSIGN,
    FEES: [...MANAGE, 'APPROVE'],
    LIBRARY: MANAGE_ASSIGN,
    HOSTEL: [...MANAGE_ASSIGN, 'APPROVE'],
    TRANSPORT: MANAGE_ASSIGN,
    LEAVE: [...MANAGE, 'APPROVE'],
    NOTICES: MANAGE,
    COMMUNICATION: MANAGE,
    DOCUMENTS: [...MANAGE, 'APPROVE'],
    REPORTS: READ_EXPORT,
    SETTINGS: ['VIEW', 'EDIT'],
    AUDIT_LOGS: READ_EXPORT,
  },

  // Classroom operations, scoped to assigned classes by the service layer.
  TEACHER: {
    DASHBOARD: READ_ONLY,
    STUDENTS: READ_ONLY,
    TEACHERS: READ_ONLY,
    ACADEMICS: READ_ONLY,
    ATTENDANCE: ['VIEW', 'CREATE', 'EDIT', 'EXPORT'],
    EXAMS: ['VIEW', 'CREATE', 'EDIT', 'EXPORT'],
    ASSIGNMENTS: [...MANAGE, 'APPROVE'],
    TIMETABLE: READ_ONLY,
    LIBRARY: READ_ONLY,
    LEAVE: ['VIEW', 'CREATE', 'APPROVE'],
    NOTICES: ['VIEW', 'CREATE'],
    COMMUNICATION: ['VIEW', 'CREATE'],
    DOCUMENTS: ['VIEW', 'CREATE'],
    REPORTS: READ_EXPORT,
  },

  // Own records only; row-level scoping is enforced in the services.
  STUDENT: {
    DASHBOARD: READ_ONLY,
    ATTENDANCE: READ_ONLY,
    EXAMS: READ_ONLY,
    ASSIGNMENTS: ['VIEW', 'CREATE'],
    TIMETABLE: READ_ONLY,
    FEES: READ_ONLY,
    LIBRARY: READ_ONLY,
    HOSTEL: ['VIEW', 'CREATE'],
    TRANSPORT: READ_ONLY,
    LEAVE: ['VIEW', 'CREATE'],
    NOTICES: READ_ONLY,
    COMMUNICATION: ['VIEW', 'CREATE'],
    DOCUMENTS: ['VIEW', 'CREATE'],
  },

  // Child records only.
  PARENT: {
    DASHBOARD: READ_ONLY,
    STUDENTS: READ_ONLY,
    ATTENDANCE: READ_ONLY,
    EXAMS: READ_ONLY,
    ASSIGNMENTS: READ_ONLY,
    TIMETABLE: READ_ONLY,
    FEES: READ_EXPORT,
    LIBRARY: READ_ONLY,
    TRANSPORT: READ_ONLY,
    LEAVE: ['VIEW', 'CREATE'],
    NOTICES: READ_ONLY,
    COMMUNICATION: ['VIEW', 'CREATE'],
    DOCUMENTS: READ_ONLY,
  },

  // Finance.
  ACCOUNTANT: {
    DASHBOARD: READ_ONLY,
    STUDENTS: READ_ONLY,
    FEES: [...MANAGE, 'APPROVE'],
    REPORTS: READ_EXPORT,
    NOTICES: READ_ONLY,
    COMMUNICATION: ['VIEW', 'CREATE'],
  },

  // Library.
  LIBRARIAN: {
    DASHBOARD: READ_ONLY,
    STUDENTS: READ_ONLY,
    TEACHERS: READ_ONLY,
    LIBRARY: [...MANAGE_ASSIGN, 'APPROVE'],
    REPORTS: READ_EXPORT,
    NOTICES: READ_ONLY,
    COMMUNICATION: ['VIEW', 'CREATE'],
  },
};

async function seedPermissions(): Promise<number> {
  const rows: Prisma.RolePermissionCreateManyInput[] = [];

  // SUPER_ADMIN is granted everything explicitly so the Settings screen can
  // display the full matrix, even though the code also bypasses the check.
  for (const module of Object.values(AppModule)) {
    for (const action of ALL_ACTIONS) {
      rows.push({ role: UserRole.SUPER_ADMIN, module, action, allowed: true });
    }
  }

  for (const [role, matrix] of Object.entries(DEFAULT_MATRIX)) {
    for (const module of Object.values(AppModule)) {
      const granted = new Set(matrix[module] ?? []);
      for (const action of ALL_ACTIONS) {
        rows.push({
          role: role as UserRole,
          module,
          action,
          allowed: granted.has(action),
        });
      }
    }
  }

  // Idempotent: re-running the seed will not duplicate or reset customisations.
  const result = await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

async function seedSuperAdmin(): Promise<void> {
  const email = process.env['SEED_ADMIN_EMAIL'] ?? 'admin@educore.local';
  const password = process.env['SEED_ADMIN_PASSWORD'] ?? 'ChangeMe@123';

  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    console.log(`  • Super admin already present (${email})`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      firstName: 'System',
      lastName: 'Administrator',
      role: UserRole.SUPER_ADMIN,
      status: 'ACTIVE',
      passwordHash: await hashPassword(password),
      // Forces a password change on first sign-in.
      mustChangePassword: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log(`  • Super admin created — ${email} / ${password}`);
}

async function seedInstitution(): Promise<void> {
  const existing = await prisma.institution.findFirst();
  if (existing) return;

  const address = await prisma.address.create({
    data: {
      type: 'OFFICE',
      line1: '1 Campus Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      postalCode: '560001',
    },
  });

  await prisma.institution.create({
    data: {
      name: 'EduCore Institute',
      code: 'EDUCORE',
      email: 'office@educore.local',
      phone: '+91 80 4000 0000',
      addressId: address.id,
      establishedYear: 1998,
      principalName: 'Dr. A. Sharma',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
    },
  });
}

async function seedGradeScale(): Promise<void> {
  const existing = await prisma.gradeScale.findFirst({ where: { isDefault: true } });
  if (existing) return;

  await prisma.gradeScale.create({
    data: {
      name: 'Standard 10-Point Scale',
      description: 'Default grading scale applied when an exam specifies none.',
      isDefault: true,
      bands: {
        create: [
          { grade: 'A+', minPercent: 90, maxPercent: 100, gradePoint: 10, description: 'Outstanding', isPass: true },
          { grade: 'A', minPercent: 80, maxPercent: 89.99, gradePoint: 9, description: 'Excellent', isPass: true },
          { grade: 'B+', minPercent: 70, maxPercent: 79.99, gradePoint: 8, description: 'Very good', isPass: true },
          { grade: 'B', minPercent: 60, maxPercent: 69.99, gradePoint: 7, description: 'Good', isPass: true },
          { grade: 'C+', minPercent: 50, maxPercent: 59.99, gradePoint: 6, description: 'Above average', isPass: true },
          { grade: 'C', minPercent: 40, maxPercent: 49.99, gradePoint: 5, description: 'Average', isPass: true },
          { grade: 'D', minPercent: 33, maxPercent: 39.99, gradePoint: 4, description: 'Pass', isPass: true },
          { grade: 'F', minPercent: 0, maxPercent: 32.99, gradePoint: 0, description: 'Needs improvement', isPass: false },
        ],
      },
    },
  });
}

async function seedTimetablePeriods(): Promise<void> {
  const existing = await prisma.timetablePeriod.count();
  if (existing > 0) return;

  await prisma.timetablePeriod.createMany({
    data: [
      { name: 'Period 1', startTime: '09:00', endTime: '09:45', sortOrder: 1, isBreak: false },
      { name: 'Period 2', startTime: '09:45', endTime: '10:30', sortOrder: 2, isBreak: false },
      { name: 'Short Break', startTime: '10:30', endTime: '10:45', sortOrder: 3, isBreak: true },
      { name: 'Period 3', startTime: '10:45', endTime: '11:30', sortOrder: 4, isBreak: false },
      { name: 'Period 4', startTime: '11:30', endTime: '12:15', sortOrder: 5, isBreak: false },
      { name: 'Lunch', startTime: '12:15', endTime: '13:00', sortOrder: 6, isBreak: true },
      { name: 'Period 5', startTime: '13:00', endTime: '13:45', sortOrder: 7, isBreak: false },
      { name: 'Period 6', startTime: '13:45', endTime: '14:30', sortOrder: 8, isBreak: false },
      { name: 'Period 7', startTime: '14:30', endTime: '15:15', sortOrder: 9, isBreak: false },
    ],
  });
}

async function seedEmailTemplates(): Promise<void> {
  const templates = [
    {
      key: 'library-due-reminder',
      name: 'Library due reminder',
      subject: 'Your library book is due {{dueDate}}',
      description: 'Sent 3, 2 and 1 days before a borrowed book falls due.',
      variables: ['firstName', 'bookTitle', 'accessionNumber', 'dueDate', 'daysRemaining', 'appName'],
      bodyHtml: `
        <p>Hello {{firstName}},</p>
        <p><strong>{{bookTitle}}</strong> (accession {{accessionNumber}}) is due back
           in {{daysRemaining}} day(s), on {{dueDate}}.</p>
        <p>Please return or renew it at the library desk to avoid a late fine.</p>
      `.trim(),
    },
    {
      key: 'password-reset',
      name: 'Password reset',
      subject: 'Reset your {{appName}} password',
      description: 'Sent when a user requests a password reset link.',
      variables: ['firstName', 'resetUrl', 'expiryMinutes', 'appName'],
      bodyHtml: `
        <p>Hello {{firstName}},</p>
        <p>We received a request to reset your EduCore password.</p>
        <p><a href="{{resetUrl}}">Reset your password</a></p>
        <p>This link expires in {{expiryMinutes}} minutes. If you did not request it,
           you can safely ignore this email.</p>
      `.trim(),
    },
    {
      key: 'account-created',
      name: 'Account created',
      subject: 'Your {{appName}} account is ready',
      description: 'Sent when an administrator provisions a new account.',
      variables: ['firstName', 'email', 'temporaryPassword', 'loginUrl', 'appName'],
      bodyHtml: `
        <p>Hello {{firstName}},</p>
        <p>An EduCore account has been created for you.</p>
        <p>Email: <strong>{{email}}</strong><br />
           Temporary password: <strong>{{temporaryPassword}}</strong></p>
        <p><a href="{{loginUrl}}">Sign in</a> and choose a new password.</p>
      `.trim(),
    },
    {
      key: 'leave-decision',
      name: 'Leave decision',
      subject: 'Your leave request was {{decision}}',
      description: 'Sent when a leave request is approved or rejected.',
      variables: ['firstName', 'decision', 'leaveType', 'fromDate', 'toDate', 'totalDays', 'comment'],
      bodyHtml: `
        <p>Hello {{firstName}},</p>
        <p>Your {{leaveType}} leave request for {{fromDate}} to {{toDate}}
           ({{totalDays}} day(s)) was <strong>{{decision}}</strong>.</p>
        <p>{{comment}}</p>
      `.trim(),
    },
    {
      key: 'new-notice',
      name: 'New notice published',
      subject: '{{title}}',
      description: 'Sent to the audience of a notice when it is published.',
      variables: ['title', 'body', 'category', 'noticeUrl'],
      bodyHtml: `
        <p><strong>{{title}}</strong></p>
        <p>{{body}}</p>
        <p><a href="{{noticeUrl}}">Read the full notice</a></p>
      `.trim(),
    },
    {
      key: 'new-message',
      name: 'New message',
      subject: 'New message from {{senderName}}',
      description: 'Sent when a user receives an internal message.',
      variables: ['senderName', 'title', 'body', 'conversationUrl'],
      bodyHtml: `
        <p>{{senderName}} sent you a message:</p>
        <blockquote>{{body}}</blockquote>
        <p><a href="{{conversationUrl}}">Open the conversation</a></p>
      `.trim(),
    },
    {
      key: 'document-verified',
      name: 'Document verification',
      subject: 'Your document was {{decision}}',
      description: 'Sent when a submitted document is verified or rejected.',
      variables: ['firstName', 'decision', 'documentTitle', 'remarks'],
      bodyHtml: `
        <p>Hello {{firstName}},</p>
        <p>The document <strong>{{documentTitle}}</strong> was {{decision}}.</p>
        <p>{{remarks}}</p>
      `.trim(),
    },
  ];

  for (const template of templates) {
    await prisma.emailTemplate.upsert({
      where: { key: template.key },
      update: {},
      create: {
        key: template.key,
        name: template.name,
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        description: template.description,
        variables: template.variables,
        isActive: true,
      },
    });
  }
}

async function seedAcademicYear(): Promise<void> {
  const existing = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  if (existing) return;

  const now = new Date();
  // Academic years run June–May in most Indian institutions.
  const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;

  const year = await prisma.academicYear.create({
    data: {
      name: `${startYear}-${startYear + 1}`,
      startDate: new Date(Date.UTC(startYear, 5, 1)),
      endDate: new Date(Date.UTC(startYear + 1, 4, 31)),
      isCurrent: true,
      status: 'ACTIVE',
    },
  });

  await prisma.attendanceRule.create({ data: { academicYearId: year.id } });
}

async function seedFeeCategories(): Promise<void> {
  const existing = await prisma.feeCategory.count();
  if (existing > 0) return;

  // Mirrors the fee categories listed in PRD Module 10.
  await prisma.feeCategory.createMany({
    data: [
      { name: 'Tuition Fee', type: 'TUITION', isRecurring: true, description: 'Core academic tuition' },
      { name: 'Hostel Fee', type: 'HOSTEL', isRecurring: true, description: 'Boarding and lodging' },
      { name: 'Transport Fee', type: 'TRANSPORT', isRecurring: true, description: 'Bus route charges' },
      { name: 'Library Fee', type: 'LIBRARY', isRecurring: true, description: 'Library membership' },
      { name: 'Examination Fee', type: 'EXAMINATION', isRecurring: false, description: 'Exam administration' },
      { name: 'Miscellaneous', type: 'MISCELLANEOUS', isRecurring: false, description: 'Other charges' },
    ],
  });
}

async function main(): Promise<void> {
  console.log('Seeding EduCore…');

  const permissionCount = await seedPermissions();
  console.log(`  • Permission matrix: ${permissionCount} new grant(s)`);

  await seedSuperAdmin();
  await seedInstitution();
  await seedAcademicYear();
  await seedGradeScale();
  await seedTimetablePeriods();
  await seedEmailTemplates();
  await seedFeeCategories();

  console.log('Seed complete.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
