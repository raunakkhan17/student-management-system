/**
 * Demo data for screenshots and manual walkthroughs.
 *
 * Separate from `seed.ts`, which creates only the skeleton a real deployment
 * needs (permissions, super admin, institution, academic year, fee categories).
 * Everything here is fictional and must never be loaded into a live instance.
 *
 * Run with `npm run seed:demo`. Safe to re-run: it exits without writing when
 * demo data is already present.
 */
import { $Enums, Prisma, PrismaClient } from '@prisma/client';
import { getLibrarySettings } from '../services/library/circulation.service';
import { hashPassword } from '../utils/password';

const prisma = new PrismaClient();

/** Every demo account shares one password so the hash is computed once. */
const DEMO_PASSWORD = 'Demo@1234';

/** Weekday-only offsets, most recent first, used for the attendance history. */
const ATTENDANCE_DAYS_BACK = 10;

/**
 * Fixed spread applied to the most recent register. Random history can leave a
 * given day all-present; this guarantees the sheet a reader opens first shows
 * every status the UI can render.
 */
const TODAY_PATTERN = [
  'PRESENT',
  'PRESENT',
  'LATE',
  'PRESENT',
  'ABSENT',
  'PRESENT',
  'PRESENT',
  'LEAVE',
] as const satisfies readonly $Enums.AttendanceStatus[];

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Midnight UTC today — matches how `@db.Date` columns round-trip. */
function today(): Date {
  const now = new Date();
  return utcDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Deterministic pseudo-random in [0, 1) so re-seeding produces the same data. */
function rand(seed: number): number {
  const x = Math.sin(seed) * 10_000;
  return x - Math.floor(x);
}

function pick<T>(items: readonly T[], seed: number): T {
  return items[Math.floor(rand(seed) * items.length)] as T;
}

// ------------------------------------------------------------------
// Name pools — invented, not drawn from any real roll.
// ------------------------------------------------------------------

const MALE_FIRST = [
  'Aarav', 'Vihaan', 'Kabir', 'Reyansh', 'Arjun', 'Ishaan', 'Advait', 'Rudra',
  'Dhruv', 'Aryan', 'Nikhil', 'Rohan', 'Tanmay', 'Yash', 'Karan', 'Devansh',
] as const;

const FEMALE_FIRST = [
  'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Ira', 'Myra', 'Kiara', 'Riya',
  'Meera', 'Anika', 'Tara', 'Navya', 'Prisha', 'Sneha', 'Aarohi', 'Ishita',
] as const;

const SURNAMES = [
  'Sharma', 'Verma', 'Iyer', 'Nair', 'Reddy', 'Patel', 'Bose', 'Chatterjee',
  'Kulkarni', 'Deshmukh', 'Menon', 'Rao', 'Gupta', 'Malhotra', 'Sinha', 'Joshi',
] as const;

const CITIES = [
  ['Pune', 'Maharashtra', '411001'],
  ['Nagpur', 'Maharashtra', '440001'],
  ['Indore', 'Madhya Pradesh', '452001'],
  ['Bengaluru', 'Karnataka', '560001'],
  ['Jaipur', 'Rajasthan', '302001'],
] as const;

const OCCUPATIONS = [
  'Civil Engineer', 'Bank Manager', 'Doctor', 'Shop Owner', 'Software Developer',
  'School Teacher', 'Chartered Accountant', 'Farmer',
] as const;

const BLOOD_GROUPS = [
  'A_POSITIVE', 'B_POSITIVE', 'O_POSITIVE', 'AB_POSITIVE', 'A_NEGATIVE', 'O_NEGATIVE',
] as const;

// ------------------------------------------------------------------
// Structure definitions
// ------------------------------------------------------------------

const DEPARTMENTS = [
  { name: 'Science', code: 'SCI', description: 'Physics, Chemistry, Biology and Mathematics' },
  { name: 'Commerce', code: 'COM', description: 'Accountancy, Business Studies and Economics' },
  { name: 'Humanities', code: 'HUM', description: 'Languages, History and Social Sciences' },
] as const;

const SUBJECTS = [
  { name: 'Mathematics', code: 'MATH101', dept: 'SCI', type: 'CORE', credits: 6 },
  { name: 'Physics', code: 'PHY101', dept: 'SCI', type: 'CORE', credits: 6 },
  { name: 'Chemistry', code: 'CHEM101', dept: 'SCI', type: 'CORE', credits: 6 },
  { name: 'Biology', code: 'BIO101', dept: 'SCI', type: 'ELECTIVE', credits: 4 },
  { name: 'Computer Science', code: 'CS101', dept: 'SCI', type: 'ELECTIVE', credits: 4 },
  { name: 'Accountancy', code: 'ACC101', dept: 'COM', type: 'CORE', credits: 5 },
  { name: 'Business Studies', code: 'BST101', dept: 'COM', type: 'CORE', credits: 5 },
  { name: 'English', code: 'ENG101', dept: 'HUM', type: 'LANGUAGE', credits: 4 },
  { name: 'Hindi', code: 'HIN101', dept: 'HUM', type: 'LANGUAGE', credits: 3 },
  { name: 'Physical Education', code: 'PED101', dept: 'HUM', type: 'ACTIVITY', credits: 2 },
] as const;

const TEACHERS = [
  { first: 'Sunita', last: 'Deshpande', gender: 'FEMALE', dept: 'SCI', designation: 'Head of Department', qualification: 'M.Sc, Ph.D (Mathematics)', specialization: 'Algebra', experience: 18, subjects: ['MATH101'] },
  { first: 'Rajesh', last: 'Krishnan', gender: 'MALE', dept: 'SCI', designation: 'Senior Teacher', qualification: 'M.Sc (Physics), B.Ed', specialization: 'Mechanics', experience: 12, subjects: ['PHY101'] },
  { first: 'Neha', last: 'Aggarwal', gender: 'FEMALE', dept: 'SCI', designation: 'Teacher', qualification: 'M.Sc (Chemistry), B.Ed', specialization: 'Organic Chemistry', experience: 7, subjects: ['CHEM101', 'BIO101'] },
  { first: 'Imran', last: 'Sheikh', gender: 'MALE', dept: 'SCI', designation: 'Teacher', qualification: 'M.C.A', specialization: 'Programming', experience: 5, subjects: ['CS101'] },
  { first: 'Lakshmi', last: 'Venkatesan', gender: 'FEMALE', dept: 'COM', designation: 'Head of Department', qualification: 'M.Com, C.A', specialization: 'Financial Accounting', experience: 15, subjects: ['ACC101', 'BST101'] },
  { first: 'Arun', last: 'Pillai', gender: 'MALE', dept: 'HUM', designation: 'Senior Teacher', qualification: 'M.A (English), B.Ed', specialization: 'Literature', experience: 11, subjects: ['ENG101'] },
  { first: 'Kavita', last: 'Trivedi', gender: 'FEMALE', dept: 'HUM', designation: 'Teacher', qualification: 'M.A (Hindi), B.Ed', specialization: 'Grammar', experience: 9, subjects: ['HIN101'] },
  { first: 'Vikram', last: 'Chauhan', gender: 'MALE', dept: 'HUM', designation: 'Sports Instructor', qualification: 'B.P.Ed', specialization: 'Athletics', experience: 6, subjects: ['PED101'] },
] as const;

/** Sections get `count` students each; Class 10-A is deliberately the largest. */
const CLASSES = [
  { name: 'Class 9', code: 'C9', yearLevel: 9, dept: 'SCI', sections: [{ name: 'A', count: 8 }, { name: 'B', count: 6 }] },
  { name: 'Class 10', code: 'C10', yearLevel: 10, dept: 'SCI', sections: [{ name: 'A', count: 12 }, { name: 'B', count: 8 }] },
  { name: 'Class 11', code: 'C11', yearLevel: 11, dept: 'COM', sections: [{ name: 'A', count: 6 }] },
] as const;

// ------------------------------------------------------------------

/**
 * Admission dates walking backwards from today in ~9-day steps, so the twelve
 * -month growth chart shows a curve and the rolling 30-day "new admissions"
 * tile always has something in it.
 */
function admissionDateFor(index: number): Date {
  const base = today();
  const daysBack = Math.floor((index - 1) * 8.5);
  const date = new Date(base.getTime() - daysBack * 86_400_000);
  return utcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

async function main(): Promise<void> {
  const existing = await prisma.department.count();
  if (existing > 0) {
    console.log('Demo data already present — nothing to do.');
    console.log('To rebuild it: npm run prisma:reset && npm run seed && npm run seed:demo');
    return;
  }

  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  if (!year) {
    throw new Error('No current academic year. Run `npm run seed` first.');
  }

  const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (!admin) {
    throw new Error('No super admin. Run `npm run seed` first.');
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const yearNumber = year.startDate.getUTCFullYear();

  console.log(`Seeding demo data into academic year ${year.name}…`);

  // --- Semesters ----------------------------------------------------
  await prisma.semester.createMany({
    data: [
      { name: 'Semester 1', academicYearId: year.id, startDate: year.startDate, endDate: utcDate(yearNumber, 10, 31), status: 'ACTIVE' },
      { name: 'Semester 2', academicYearId: year.id, startDate: utcDate(yearNumber, 11, 1), endDate: year.endDate, status: 'UPCOMING' },
    ],
  });
  const semester = await prisma.semester.findFirstOrThrow({
    where: { academicYearId: year.id, name: 'Semester 1' },
  });

  // --- Departments, courses, subjects --------------------------------
  const departments = new Map<string, string>();
  for (const dept of DEPARTMENTS) {
    const row = await prisma.department.create({ data: { ...dept } });
    departments.set(dept.code, row.id);
  }

  await prisma.course.createMany({
    data: [
      { name: 'Senior Secondary — Science', code: 'SS-SCI', departmentId: departments.get('SCI') as string, durationYears: 2, description: 'Classes 11 and 12, science stream' },
      { name: 'Senior Secondary — Commerce', code: 'SS-COM', departmentId: departments.get('COM') as string, durationYears: 2, description: 'Classes 11 and 12, commerce stream' },
    ],
  });

  const subjects = new Map<string, string>();
  for (const subject of SUBJECTS) {
    const row = await prisma.subject.create({
      data: {
        name: subject.name,
        code: subject.code,
        departmentId: departments.get(subject.dept) as string,
        type: subject.type,
        credits: subject.credits,
      },
    });
    subjects.set(subject.code, row.id);
  }

  // --- Teachers -------------------------------------------------------
  const teachers: { id: string; subjects: readonly string[] }[] = [];
  for (const [index, teacher] of TEACHERS.entries()) {
    const user = await prisma.user.create({
      data: {
        email: `${teacher.first}.${teacher.last}@educore.local`.toLowerCase(),
        phone: `98${String(76000000 + index * 137).padStart(8, '0')}`,
        passwordHash,
        role: 'TEACHER',
        status: 'ACTIVE',
        firstName: teacher.first,
        lastName: teacher.last,
      },
    });

    const [city, state, postalCode] = pick(CITIES, index + 1);
    const address = await prisma.address.create({
      data: { type: 'PERMANENT', line1: `${12 + index} Staff Quarters`, city, state, postalCode },
    });

    const row = await prisma.teacher.create({
      data: {
        userId: user.id,
        employeeId: `EMP/${yearNumber}/${String(index + 1).padStart(4, '0')}`,
        departmentId: departments.get(teacher.dept) as string,
        designation: teacher.designation,
        qualification: teacher.qualification,
        specialization: teacher.specialization,
        experienceYears: teacher.experience,
        joiningDate: utcDate(yearNumber - teacher.experience, 6, 15),
        employmentType: 'FULL_TIME',
        status: 'ACTIVE',
        gender: teacher.gender,
        dateOfBirth: utcDate(1985 + index, ((index * 3) % 12) + 1, ((index * 5) % 27) + 1),
        addressId: address.id,
        subjects: {
          create: teacher.subjects.map((code) => ({ subjectId: subjects.get(code) as string })),
        },
      },
    });

    teachers.push({ id: row.id, subjects: teacher.subjects });

    // The two "Head of Department" teachers lead their own department.
    if (teacher.designation === 'Head of Department') {
      await prisma.department.update({
        where: { id: departments.get(teacher.dept) as string },
        data: { headTeacherId: row.id },
      });
    }
  }

  /** First teacher qualified to teach `code`, for offering assignment. */
  const teacherFor = (code: string): string | undefined =>
    teachers.find((t) => t.subjects.includes(code))?.id;

  // --- Classes, sections, offerings -----------------------------------
  interface SectionRef {
    classId: string;
    sectionId: string;
    className: string;
    sectionName: string;
    count: number;
  }
  const sectionRefs: SectionRef[] = [];

  for (const [classIndex, klass] of CLASSES.entries()) {
    const classRow = await prisma.class.create({
      data: {
        name: klass.name,
        code: klass.code,
        academicYearId: year.id,
        departmentId: departments.get(klass.dept) as string,
        yearLevel: klass.yearLevel,
        capacity: 60,
        classTeacherId: teachers[classIndex]?.id ?? null,
      },
    });

    for (const [sectionIndex, section] of klass.sections.entries()) {
      const sectionRow = await prisma.section.create({
        data: {
          name: section.name,
          classId: classRow.id,
          capacity: 40,
          classTeacherId: teachers[(classIndex * 2 + sectionIndex) % teachers.length]?.id ?? null,
        },
      });

      sectionRefs.push({
        classId: classRow.id,
        sectionId: sectionRow.id,
        className: klass.name,
        sectionName: section.name,
        count: section.count,
      });

      // Commerce classes take the commerce subjects; science classes the rest.
      const codes =
        klass.dept === 'COM'
          ? ['ACC101', 'BST101', 'ENG101', 'MATH101', 'PED101']
          : ['MATH101', 'PHY101', 'CHEM101', 'ENG101', 'HIN101', 'CS101'];

      await prisma.classSubject.createMany({
        data: codes.map((code) => ({
          classId: classRow.id,
          sectionId: sectionRow.id,
          subjectId: subjects.get(code) as string,
          semesterId: semester.id,
          teacherId: teacherFor(code) ?? null,
          isElective: SUBJECTS.find((s) => s.code === code)?.type === 'ELECTIVE',
        })),
      });
    }
  }

  // --- Students -------------------------------------------------------
  interface StudentRef {
    id: string;
    sectionId: string;
    className: string;
    name: string;
  }
  const students: StudentRef[] = [];
  let admissionCounter = 0;

  for (const ref of sectionRefs) {
    for (let i = 0; i < ref.count; i += 1) {
      admissionCounter += 1;
      const seed = admissionCounter;

      const isFemale = rand(seed * 7) < 0.5;
      const first = isFemale ? pick(FEMALE_FIRST, seed * 3) : pick(MALE_FIRST, seed * 3);
      const last = pick(SURNAMES, seed * 11);
      const [city, state, postalCode] = pick(CITIES, seed * 13);
      // Class 9 students are ~14, Class 11 ~16.
      const birthYear = yearNumber - (CLASSES.find((c) => c.name === ref.className)?.yearLevel ?? 10) - 5;

      const user = await prisma.user.create({
        data: {
          email: `${first}.${last}.${admissionCounter}@student.educore.local`.toLowerCase(),
          phone: `97${String(65000000 + admissionCounter * 211).padStart(8, '0')}`,
          passwordHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          firstName: first,
          lastName: last,
        },
      });

      const address = await prisma.address.create({
        data: {
          type: 'PERMANENT',
          line1: `${10 + (seed % 90)} ${pick(['Gandhi Road', 'Nehru Nagar', 'Shivaji Path', 'Tagore Lane', 'Bose Colony'], seed * 17)}`,
          city,
          state,
          postalCode,
        },
      });

      const guardianFirst = isFemale ? pick(MALE_FIRST, seed * 19) : pick(MALE_FIRST, seed * 23);
      const guardian = await prisma.guardian.create({
        data: {
          firstName: guardianFirst,
          lastName: last,
          relation: 'FATHER',
          occupation: pick(OCCUPATIONS, seed * 29),
          phone: `99${String(12000000 + admissionCounter * 317).padStart(8, '0')}`,
          email: `${guardianFirst}.${last}.${admissionCounter}@example.local`.toLowerCase(),
          annualIncome: new Prisma.Decimal(300000 + Math.floor(rand(seed * 31) * 900000)),
          addressId: address.id,
        },
      });

      const student = await prisma.student.create({
        data: {
          userId: user.id,
          admissionNumber: `ADM/${yearNumber}/${String(admissionCounter).padStart(4, '0')}`,
          rollNumber: String(i + 1).padStart(2, '0'),
          // Spread across the intake months rather than one bulk date, so the
          // growth chart has a curve and "new admissions" is not always zero.
          admissionDate: admissionDateFor(admissionCounter),
          academicYearId: year.id,
          classId: ref.classId,
          sectionId: ref.sectionId,
          gender: isFemale ? 'FEMALE' : 'MALE',
          dateOfBirth: utcDate(birthYear, ((seed * 5) % 12) + 1, ((seed * 7) % 27) + 1),
          bloodGroup: pick(BLOOD_GROUPS, seed * 37),
          nationality: 'Indian',
          status: 'ACTIVE',
          emergencyContactName: `${guardianFirst} ${last}`,
          emergencyContactPhone: guardian.phone,
          emergencyContactRelation: 'Father',
          permanentAddressId: address.id,
          currentAddressId: address.id,
          guardians: {
            create: [{ guardianId: guardian.id, relation: 'FATHER', isPrimary: true }],
          },
        },
      });

      students.push({
        id: student.id,
        sectionId: ref.sectionId,
        className: ref.className,
        name: `${first} ${last}`,
      });
    }
  }

  console.log(`  • ${students.length} students across ${sectionRefs.length} sections`);

  // --- Attendance ------------------------------------------------------
  // Every section gets recent history. The most recent day is left DRAFT so
  // the register opens editable rather than locked.
  const base = today();
  let sessionCount = 0;

  for (const ref of sectionRefs) {
    const roster = students.filter((s) => s.sectionId === ref.sectionId);

    for (let back = ATTENDANCE_DAYS_BACK; back >= 0; back -= 1) {
      const date = addDays(base, -back);
      const weekday = date.getUTCDay();
      if (weekday === 0) continue; // Sunday

      const isToday = back === 0;
      const session = await prisma.attendanceSession.create({
        data: {
          classId: ref.classId,
          sectionId: ref.sectionId,
          date,
          status: isToday ? 'DRAFT' : 'SUBMITTED',
          markedById: admin.id,
          submittedAt: isToday ? null : date,
          remarks: isToday ? 'Morning roll call' : null,
        },
      });
      sessionCount += 1;

      await prisma.attendanceRecord.createMany({
        data: roster.map((student, index) => {
          // History is ~88% present with a scattering of exceptions. Today's
          // register is fixed rather than random so the sheet always shows
          // every status — it is the one a reader is most likely to open.
          const roll = rand(sessionCount * 101 + index * 7);
          const status = isToday
            ? (TODAY_PATTERN[index % TODAY_PATTERN.length] ?? 'PRESENT')
            : roll > 0.94
              ? 'ABSENT'
              : roll > 0.89
                ? 'LATE'
                : roll > 0.87
                  ? 'LEAVE'
                  : 'PRESENT';

          return {
            sessionId: session.id,
            studentId: student.id,
            status,
            minutesLate: status === 'LATE' ? 5 + Math.floor(rand(index + sessionCount) * 20) : null,
            remarks: status === 'LEAVE' ? 'Approved family leave' : null,
          } satisfies Prisma.AttendanceRecordCreateManyInput;
        }),
      });
    }
  }

  console.log(`  • ${sessionCount} attendance sessions`);

  // --- Examinations -----------------------------------------------------
  // One finished exam with published results (so report cards, rankings and
  // the parent "recent marks" widget have data) and one still ahead (so the
  // "upcoming exams" widget is not empty).
  const gradeScale = await prisma.gradeScale.findFirst({ select: { id: true } });
  let scheduleCount = 0;
  let markCount = 0;

  for (const ref of sectionRefs.filter((section) => section.sectionName === 'A')) {
    const roster = students.filter((student) => student.sectionId === ref.sectionId);
    if (roster.length === 0) continue;

    const offerings = await prisma.classSubject.findMany({
      where: { classId: ref.classId, sectionId: ref.sectionId },
      select: { subjectId: true, teacherId: true },
      take: 4,
    });

    const plans = [
      { name: `Unit Test 1 — ${ref.className}`, type: 'UNIT_TEST' as const, start: -32, status: 'RESULTS_PUBLISHED' as const },
      { name: `Mid Semester — ${ref.className}`, type: 'MID_SEMESTER' as const, start: 21, status: 'SCHEDULED' as const },
    ];

    for (const plan of plans) {
      const startDate = addDays(base, plan.start);

      const exam = await prisma.exam.create({
        data: {
          name: plan.name,
          type: plan.type,
          academicYearId: year.id,
          semesterId: semester.id,
          classId: ref.classId,
          startDate,
          endDate: addDays(startDate, offerings.length - 1),
          status: plan.status,
          gradeScaleId: gradeScale?.id ?? null,
          resultsPublishedAt: plan.status === 'RESULTS_PUBLISHED' ? addDays(startDate, 7) : null,
          createdById: admin.id,
        },
      });

      for (const [index, offering] of offerings.entries()) {
        const schedule = await prisma.examSchedule.create({
          data: {
            examId: exam.id,
            classId: ref.classId,
            sectionId: ref.sectionId,
            subjectId: offering.subjectId,
            examDate: addDays(startDate, index),
            startTime: '10:00',
            endTime: '12:00',
            maxMarks: new Prisma.Decimal(50),
            passingMarks: new Prisma.Decimal(17),
            invigilatorId: offering.teacherId,
          },
        });
        scheduleCount += 1;

        // Only the completed exam carries marks.
        if (plan.status !== 'RESULTS_PUBLISHED') continue;

        await prisma.mark.createMany({
          data: roster.map((student, seat) => {
            const roll = rand(scheduleCount * 71 + seat * 13);
            const isAbsent = roll > 0.96;

            return {
              examScheduleId: schedule.id,
              studentId: student.id,
              // A believable spread rather than a uniform one: most pass, a few
              // do very well, a couple fall below the pass mark.
              marksObtained: isAbsent ? null : new Prisma.Decimal(Math.round(18 + roll * 31)),
              isAbsent,
              enteredById: admin.id,
              verifiedById: admin.id,
              verifiedAt: addDays(startDate, 5),
            } satisfies Prisma.MarkCreateManyInput;
          }),
        });
        markCount += roster.length;
      }
    }
  }

  console.log(`  • exams: ${scheduleCount} papers, ${markCount} marks`);

  // --- Fees -------------------------------------------------------------
  const categories = await prisma.feeCategory.findMany({ select: { id: true, name: true } });
  const categoryId = (name: string): string =>
    categories.find((c) => c.name === name)?.id ?? (categories[0]?.id as string);

  const FEE_LINES = [
    { category: 'Tuition Fee', amount: 42000 },
    { category: 'Library Fee', amount: 2500 },
    { category: 'Examination Fee', amount: 3500 },
    { category: 'Miscellaneous', amount: 2000 },
  ] as const;
  const structureTotal = FEE_LINES.reduce((sum, line) => sum + line.amount, 0);

  const classRows = await prisma.class.findMany({
    where: { academicYearId: year.id },
    select: { id: true, name: true },
  });

  let invoiceCounter = 0;
  let receiptCounter = 0;
  const dueDate = utcDate(yearNumber, 9, 30);
  const issueDate = utcDate(yearNumber, 7, 1);

  for (const classRow of classRows) {
    const structure = await prisma.feeStructure.create({
      data: {
        name: `${classRow.name} — Annual Fees ${year.name}`,
        academicYearId: year.id,
        classId: classRow.id,
        totalAmount: new Prisma.Decimal(structureTotal),
        description: 'Annual fee schedule payable in two instalments',
        isActive: true,
        items: {
          create: FEE_LINES.map((line) => ({
            feeCategoryId: categoryId(line.category),
            amount: new Prisma.Decimal(line.amount),
            dueDate,
          })),
        },
      },
    });

    const classSections = sectionRefs.filter((s) => s.classId === classRow.id);
    const roster = students.filter((s) => classSections.some((c) => c.sectionId === s.sectionId));

    for (const student of roster) {
      invoiceCounter += 1;
      const roll = rand(invoiceCounter * 53);

      // A realistic spread: fully paid, part paid, untouched, and overdue.
      const paidFraction = roll > 0.7 ? 1 : roll > 0.4 ? 0.5 : roll > 0.2 ? 0.25 : 0;
      const paidAmount = Math.round(structureTotal * paidFraction);
      const balance = structureTotal - paidAmount;
      const isOverdue = balance > 0 && dueDate.getTime() < base.getTime();

      const status =
        balance === 0 ? 'PAID' : isOverdue ? 'OVERDUE' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING';

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV/${yearNumber}/${String(invoiceCounter).padStart(4, '0')}`,
          studentId: student.id,
          academicYearId: year.id,
          feeStructureId: structure.id,
          issueDate,
          dueDate,
          subtotal: new Prisma.Decimal(structureTotal),
          totalAmount: new Prisma.Decimal(structureTotal),
          paidAmount: new Prisma.Decimal(paidAmount),
          balanceAmount: new Prisma.Decimal(balance),
          status,
          createdById: admin.id,
          items: {
            create: FEE_LINES.map((line) => ({
              feeCategoryId: categoryId(line.category),
              description: `${line.category} — ${classRow.name}`,
              amount: new Prisma.Decimal(line.amount),
            })),
          },
        },
      });

      if (paidAmount > 0) {
        receiptCounter += 1;
        const methods = ['CASH', 'UPI', 'NET_BANKING', 'CARD', 'CHEQUE'] as const;
        const method = pick(methods, invoiceCounter * 59);

        await prisma.payment.create({
          data: {
            receiptNumber: `RCPT/${yearNumber}/${String(receiptCounter).padStart(4, '0')}`,
            invoiceId: invoice.id,
            studentId: student.id,
            amount: new Prisma.Decimal(paidAmount),
            method,
            status: 'COMPLETED',
            paidAt: addDays(issueDate, 5 + Math.floor(rand(invoiceCounter * 61) * 40)),
            transactionRef: method === 'CASH' ? null : `TXN${String(900000 + receiptCounter * 37)}`,
            collectedById: admin.id,
          },
        });
      }
    }
  }

  // A short past-due term invoice for a slice of the roster, so the invoice
  // list exercises OVERDUE as well as the three states above.
  const termDueDate = addDays(base, -18);
  const termIssueDate = addDays(termDueDate, -25);
  const termLines = [
    { category: 'Examination Fee', amount: 1800 },
    { category: 'Library Fee', amount: 700 },
  ] as const;
  const termTotal = termLines.reduce((sum, line) => sum + line.amount, 0);

  for (const student of students.filter((_, index) => index % 5 === 0)) {
    invoiceCounter += 1;

    await prisma.invoice.create({
      data: {
        invoiceNumber: `INV/${yearNumber}/${String(invoiceCounter).padStart(4, '0')}`,
        studentId: student.id,
        academicYearId: year.id,
        issueDate: termIssueDate,
        dueDate: termDueDate,
        subtotal: new Prisma.Decimal(termTotal),
        totalAmount: new Prisma.Decimal(termTotal),
        paidAmount: new Prisma.Decimal(0),
        balanceAmount: new Prisma.Decimal(termTotal),
        status: 'OVERDUE',
        notes: 'Term 1 examination charges — payment pending',
        createdById: admin.id,
        items: {
          create: termLines.map((line) => ({
            feeCategoryId: categoryId(line.category),
            description: `${line.category} — Term 1`,
            amount: new Prisma.Decimal(line.amount),
          })),
        },
      },
    });
  }

  console.log(`  • ${invoiceCounter} invoices, ${receiptCounter} payments`);

  // --- Library ----------------------------------------------------------
  const bookCategories = [
    { name: 'Textbooks', code: 'TXT' },
    { name: 'Reference', code: 'REF' },
    { name: 'Fiction', code: 'FIC' },
    { name: 'Competitive Exams', code: 'CMP' },
  ];
  const categoryIds = new Map<string, string>();
  for (const category of bookCategories) {
    const row = await prisma.bookCategory.create({ data: category });
    categoryIds.set(category.code, row.id);
  }

  const publisher = await prisma.publisher.create({
    data: { name: 'Meridian Academic Press', contact: '020-25500100', email: 'orders@meridianpress.local' },
  });

  const shelves = await Promise.all(
    [
      { code: 'A1', name: 'Science — Row A', location: 'Ground floor, east wing' },
      { code: 'B1', name: 'Commerce — Row B', location: 'Ground floor, west wing' },
      { code: 'C1', name: 'Fiction — Row C', location: 'First floor' },
    ].map((shelf) => prisma.shelf.create({ data: { ...shelf, capacity: 150 } })),
  );

  const BOOKS = [
    { title: 'Concepts of Physics — Volume 1', isbn: '9788177091878', category: 'TXT', author: 'H. C. Verma', year: 2019, pages: 448, copies: 6 },
    { title: 'Mathematics for Class X', isbn: '9789389999112', category: 'TXT', author: 'R. D. Sharma', year: 2021, pages: 620, copies: 8 },
    { title: 'Organic Chemistry Simplified', isbn: '9788121924801', category: 'REF', author: 'Meera Raghavan', year: 2020, pages: 512, copies: 4 },
    { title: 'Principles of Accountancy', isbn: '9788194558903', category: 'TXT', author: 'T. S. Grewal', year: 2022, pages: 480, copies: 5 },
    { title: 'The Guide', isbn: '9780143039631', category: 'FIC', author: 'R. K. Narayan', year: 2006, pages: 220, copies: 3 },
    { title: 'Wings of Fire', isbn: '9788173711466', category: 'FIC', author: 'A. P. J. Abdul Kalam', year: 1999, pages: 180, copies: 4 },
    { title: 'General Knowledge Compendium', isbn: '9789390166275', category: 'CMP', author: 'Nalini Bhaskar', year: 2023, pages: 640, copies: 5 },
    { title: 'Indian History — A Concise Survey', isbn: '9788125040231', category: 'REF', author: 'Sanjay Mukherjee', year: 2018, pages: 390, copies: 3 },
  ] as const;

  let accession = 0;
  for (const [index, book] of BOOKS.entries()) {
    const author = await prisma.author.upsert({
      where: { name: book.author },
      update: {},
      create: { name: book.author },
    });

    const row = await prisma.book.create({
      data: {
        title: book.title,
        isbn: book.isbn,
        categoryId: categoryIds.get(book.category) as string,
        publisherId: publisher.id,
        edition: `${1 + (index % 3)} ed.`,
        publishYear: book.year,
        language: 'English',
        pages: book.pages,
        totalCopies: book.copies,
        availableCopies: book.copies,
        authors: { create: [{ authorId: author.id }] },
      },
    });

    await prisma.bookCopy.createMany({
      data: Array.from({ length: book.copies }, () => {
        accession += 1;
        return {
          bookId: row.id,
          accessionNumber: `ACC/${yearNumber}/${String(accession).padStart(5, '0')}`,
          shelfId: shelves[index % shelves.length]?.id ?? null,
          status: 'AVAILABLE',
          condition: accession % 4 === 0 ? 'GOOD' : 'NEW',
          purchaseDate: utcDate(yearNumber, 6, 20),
          price: new Prisma.Decimal(250 + (accession % 6) * 75),
        } satisfies Prisma.BookCopyCreateManyInput;
      }),
    });
  }

  console.log(`  • ${BOOKS.length} books, ${accession} copies`);

  // --- Circulation --------------------------------------------------------
  // A slice of the roster has books out, including two overdue, so the
  // library module and the student profile's Library tab are not empty.
  const settings = await getLibrarySettings();
  const loanDays = settings.maxIssueDays;
  const finePerDay = settings.finePerDay;

  const borrowable = await prisma.bookCopy.findMany({
    where: { status: 'AVAILABLE' },
    take: 12,
    select: { id: true },
  });

  const borrowers = await prisma.student.findMany({
    where: { id: { in: students.slice(0, 12).map((student) => student.id) } },
    select: { userId: true },
  });

  let loanCount = 0;
  for (const [index, copy] of borrowable.entries()) {
    const borrower = borrowers[index % borrowers.length];
    if (!borrower) break;

    // Every fourth loan is deliberately past its due date.
    const isOverdue = index % 4 === 3;
    // Loans 0, 1 and 2 fall due in 3, 2 and 1 days so the reminder job has
    // something to send in every window.
    const dueSoonIn = index < 3 ? 3 - index : null;
    const issueDate =
      dueSoonIn !== null
        ? addDays(base, dueSoonIn - loanDays)
        : addDays(base, isOverdue ? -(loanDays + 6) : -(index % loanDays));
    const dueDate = addDays(issueDate, loanDays);
    const daysOverdue = Math.max(0, Math.floor((base.getTime() - dueDate.getTime()) / 86_400_000));

    await prisma.bookTransaction.create({
      data: {
        bookCopyId: copy.id,
        memberId: borrower.userId,
        type: 'ISSUE',
        status: daysOverdue > 0 ? 'OVERDUE' : 'ACTIVE',
        issueDate,
        dueDate,
        fineAmount: new Prisma.Decimal(daysOverdue * finePerDay),
        issuedById: admin.id,
      },
    });

    await prisma.bookCopy.update({ where: { id: copy.id }, data: { status: 'ISSUED' } });
    loanCount += 1;
  }

  // Keep each title's availability counter consistent with its copies.
  const titles = await prisma.book.findMany({ select: { id: true } });
  for (const title of titles) {
    const available = await prisma.bookCopy.count({
      where: { bookId: title.id, status: 'AVAILABLE', deletedAt: null },
    });
    await prisma.book.update({ where: { id: title.id }, data: { availableCopies: available } });
  }

  console.log(`  • ${loanCount} book loans`);

  // --- Hostel -------------------------------------------------------------
  const hostelPlans = [
    { name: 'Nilgiri Boys Hostel', code: 'NBH', type: 'BOYS' as const, floors: 2, roomsPerFloor: 5 },
    { name: 'Kaveri Girls Hostel', code: 'KGH', type: 'GIRLS' as const, floors: 2, roomsPerFloor: 5 },
  ];

  let roomCount = 0;
  let allocationCount = 0;
  // Boarders are drawn from the back of the roster so day scholars stay the
  // majority, as they would be in a real school.
  const boarders = [...students].reverse();
  let boarderIndex = 0;

  for (const [hostelIndex, plan] of hostelPlans.entries()) {
    const hostel = await prisma.hostel.create({
      data: {
        name: plan.name,
        code: plan.code,
        type: plan.type,
        address: `${plan.name}, Campus Road, ${pick(CITIES, hostelIndex + 3)[0]}`,
        contactPhone: `080${String(45000000 + hostelIndex * 1111)}`,
        wardenId: teachers[hostelIndex]?.id ?? null,
        description: 'Residential block with mess and common room.',
      },
    });

    for (let floor = 1; floor <= plan.floors; floor += 1) {
      for (let n = 1; n <= plan.roomsPerFloor; n += 1) {
        const capacity = n % 5 === 0 ? 3 : 2;
        const room = await prisma.hostelRoom.create({
          data: {
            hostelId: hostel.id,
            roomNumber: `${floor}0${n}`,
            floor: `Floor ${floor}`,
            type: capacity === 3 ? 'TRIPLE' : 'DOUBLE',
            capacity,
            occupied: 0,
            monthlyRent: new Prisma.Decimal(capacity === 3 ? 4500 : 6000),
            status: 'AVAILABLE',
          },
        });
        roomCount += 1;

        // Fill roughly two thirds of rooms so occupancy is a real number.
        if (roomCount % 3 === 0) continue;

        const beds = Math.min(capacity, roomCount % 4 === 0 ? capacity : capacity - 1);
        let placed = 0;

        for (let bed = 0; bed < beds; bed += 1) {
          const student = boarders[boarderIndex];
          if (!student) break;
          boarderIndex += 1;

          await prisma.hostelAllocation.create({
            data: {
              roomId: room.id,
              studentId: student.id,
              bedNumber: `B${bed + 1}`,
              allocatedFrom: addDays(base, -120),
              status: 'ACTIVE',
              allocatedById: admin.id,
            },
          });
          placed += 1;
          allocationCount += 1;
        }

        if (placed > 0) {
          await prisma.hostelRoom.update({
            where: { id: room.id },
            data: {
              occupied: placed,
              status: placed >= capacity ? 'FULL' : 'PARTIALLY_OCCUPIED',
            },
          });
        }
      }
    }
  }

  console.log(`  • ${hostelPlans.length} hostels, ${roomCount} rooms, ${allocationCount} boarders`);

  // --- Transport ----------------------------------------------------------
  const vehiclePlans = [
    { reg: 'KA01AB1234', make: 'Tata', model: 'Starbus', capacity: 45 },
    { reg: 'KA01CD5678', make: 'Ashok Leyland', model: 'Lynx', capacity: 40 },
    { reg: 'KA01EF9012', make: 'Force', model: 'Traveller', capacity: 24 },
  ];

  const driverPlans = [
    { first: 'Ramesh', last: 'Yadav', licence: 'KA0120180001234' },
    { first: 'Suresh', last: 'Naik', licence: 'KA0120160005678' },
    { first: 'Mahesh', last: 'Gowda', licence: 'KA0120190009012' },
  ];

  const vehicles = await Promise.all(
    vehiclePlans.map((vehicle, index) =>
      prisma.vehicle.create({
        data: {
          registrationNumber: vehicle.reg,
          make: vehicle.make,
          model: vehicle.model,
          type: vehicle.capacity > 30 ? 'BUS' : 'MINI_BUS',
          capacity: vehicle.capacity,
          manufactureYear: 2018 + index,
          insuranceExpiry: addDays(base, 120 + index * 30),
          fitnessExpiry: addDays(base, 200 + index * 30),
          pollutionExpiry: addDays(base, 60 + index * 20),
          status: 'ACTIVE',
        },
      }),
    ),
  );

  const drivers = await Promise.all(
    driverPlans.map((driver, index) =>
      prisma.driver.create({
        data: {
          employeeCode: `DRV/${yearNumber}/${String(index + 1).padStart(3, '0')}`,
          firstName: driver.first,
          lastName: driver.last,
          phone: `98${String(45000000 + index * 4321)}`,
          licenseNumber: driver.licence,
          licenseExpiry: addDays(base, 400 + index * 60),
          experienceYears: 6 + index * 3,
          status: 'ACTIVE',
        },
      }),
    ),
  );

  const routePlans = [
    { name: 'North Loop', code: 'RT-N', start: 'Campus Gate', end: 'Yelahanka', km: 14.5, fare: 1800, stops: ['Sahakar Nagar', 'Hebbal', 'Jakkur', 'Yelahanka'] },
    { name: 'South Loop', code: 'RT-S', start: 'Campus Gate', end: 'Jayanagar', km: 11.2, fare: 1600, stops: ['Wilson Garden', 'Lalbagh', 'Jayanagar'] },
    { name: 'East Loop', code: 'RT-E', start: 'Campus Gate', end: 'Whitefield', km: 18.9, fare: 2200, stops: ['Indiranagar', 'Marathahalli', 'Whitefield'] },
  ];

  let stopCount = 0;
  let riderCount = 0;
  // Day scholars ride; the boarders allocated above do not need transport.
  const riders = students.slice(0, 18);
  let riderIndex = 0;

  for (const [routeIndex, plan] of routePlans.entries()) {
    const route = await prisma.transportRoute.create({
      data: {
        name: plan.name,
        code: plan.code,
        startPoint: plan.start,
        endPoint: plan.end,
        distanceKm: new Prisma.Decimal(plan.km),
        estimatedMins: 30 + routeIndex * 8,
        fare: new Prisma.Decimal(plan.fare),
        vehicleId: vehicles[routeIndex]?.id ?? null,
        driverId: drivers[routeIndex]?.id ?? null,
        attendantName: `${pick(FEMALE_FIRST, routeIndex + 5)} ${pick(SURNAMES, routeIndex + 9)}`,
        attendantPhone: `97${String(33000000 + routeIndex * 2222)}`,
        isActive: true,
      },
    });

    const stops = await Promise.all(
      plan.stops.map((stopName, index) =>
        prisma.routeStop.create({
          data: {
            routeId: route.id,
            name: stopName,
            sequence: index + 1,
            pickupTime: `07:${String(15 + index * 8).padStart(2, '0')}`,
            dropTime: `15:${String(30 + index * 8).padStart(2, '0')}`,
            landmark: `${stopName} bus stand`,
          },
        }),
      ),
    );
    stopCount += stops.length;

    for (let n = 0; n < 6; n += 1) {
      const student = riders[riderIndex];
      const stop = stops[n % stops.length];
      if (!student || !stop) break;
      riderIndex += 1;

      await prisma.studentTransport.create({
        data: {
          studentId: student.id,
          routeId: route.id,
          stopId: stop.id,
          academicYearId: year.id,
          startDate: addDays(base, -150),
          fare: new Prisma.Decimal(plan.fare),
          status: 'ACTIVE',
        },
      });
      riderCount += 1;
    }
  }

  console.log(
    `  • ${vehicles.length} vehicles, ${drivers.length} drivers, ${routePlans.length} routes, ${stopCount} stops, ${riderCount} riders`,
  );

  // --- Staff and parent logins -------------------------------------------
  // The base seed creates only a super admin. Every other role needs an
  // account before its dashboard and permission scoping can be exercised.
  const STAFF = [
    { first: 'Priya', last: 'Raghunathan', email: 'admin@demo.educore.local', role: 'ADMIN' as const },
    { first: 'Suresh', last: 'Kamath', email: 'accountant@demo.educore.local', role: 'ACCOUNTANT' as const },
    { first: 'Fatima', last: 'Qureshi', email: 'librarian@demo.educore.local', role: 'LIBRARIAN' as const },
  ];

  for (const [index, member] of STAFF.entries()) {
    await prisma.user.create({
      data: {
        email: member.email,
        phone: `96${String(70000000 + index * 909).padStart(8, '0')}`,
        passwordHash,
        role: member.role,
        status: 'ACTIVE',
        firstName: member.first,
        lastName: member.last,
      },
    });
  }

  // Give the first few guardians a portal login. Their children sit in the
  // sections that have marks and invoices, so the parent dashboard has data.
  const parentGuardians = await prisma.studentGuardian.findMany({
    where: { isPrimary: true },
    orderBy: { student: { admissionNumber: 'asc' } },
    take: 3,
    select: {
      guardian: { select: { id: true, firstName: true, lastName: true, phone: true } },
    },
  });

  for (const [index, link] of parentGuardians.entries()) {
    const parent = await prisma.user.create({
      data: {
        email: `parent${index + 1}@demo.educore.local`,
        phone: link.guardian.phone,
        passwordHash,
        role: 'PARENT',
        status: 'ACTIVE',
        firstName: link.guardian.firstName,
        lastName: link.guardian.lastName,
      },
    });

    await prisma.guardian.update({
      where: { id: link.guardian.id },
      data: { userId: parent.id },
    });
  }

  console.log(`  • ${STAFF.length} staff logins, ${parentGuardians.length} parent logins`);

  console.log('\nDemo data ready.');
  console.log(`  Every demo account signs in with: ${DEMO_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
