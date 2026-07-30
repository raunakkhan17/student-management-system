import type { Request, Response } from 'express';
import * as academicYearService from '@/services/academic/academic-year.service';
import * as classService from '@/services/academic/class.service';
import * as classSubjectService from '@/services/academic/class-subject.service';
import * as courseService from '@/services/academic/course.service';
import * as departmentService from '@/services/academic/department.service';
import * as sectionService from '@/services/academic/section.service';
import * as semesterService from '@/services/academic/semester.service';
import * as subjectService from '@/services/academic/subject.service';
import { auditFromRequest, redact } from '@/services/audit.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { buildListQuery } from '@/utils/pagination';

/** Every handler in this module writes to the ACADEMICS audit stream. */
const MODULE = 'ACADEMICS' as const;

function paramId(req: Request): string {
  return req.params['id'] as string;
}

// ------------------------------------------------------------- Academic years

export const listAcademicYears = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: academicYearService.ACADEMIC_YEAR_SORT_FIELDS,
    defaultSortBy: 'startDate',
    defaultSortOrder: 'desc',
  });

  const { items, pagination } = await academicYearService.listAcademicYears(query, {
    status: req.query['status'] as never,
    isCurrent: req.query['isCurrent'] as boolean | undefined,
  });

  sendPaginated(res, items, pagination, 'Academic years retrieved successfully');
});

export const getCurrentAcademicYear = asyncHandler(async (_req: Request, res: Response) => {
  const year = await academicYearService.getCurrentAcademicYear();
  sendSuccess(res, year, 'Current academic year retrieved successfully');
});

export const getAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const year = await academicYearService.getAcademicYear(paramId(req));
  sendSuccess(res, year, 'Academic year retrieved successfully');
});

export const createAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const year = await academicYearService.createAcademicYear(req.body);
  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'AcademicYear',
    entityId: year.id,
    description: `Created academic year ${year.name}`,
    newValue: redact(year),
  });
  sendCreated(res, year, 'Academic year created successfully');
});

export const updateAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await academicYearService.getAcademicYear(id);
  const year = await academicYearService.updateAcademicYear(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'AcademicYear',
    entityId: id,
    description: `Updated academic year ${year.name}`,
    oldValue: redact(before),
    newValue: redact(year),
  });

  sendSuccess(res, year, 'Academic year updated successfully');
});

export const deleteAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await academicYearService.getAcademicYear(id);
  await academicYearService.deleteAcademicYear(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'AcademicYear',
    entityId: id,
    description: `Archived academic year ${before.name}`,
    oldValue: redact(before),
  });

  sendSuccess(res, null, 'Academic year archived successfully');
});

// ---------------------------------------------------------------- Departments

export const listDepartments = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: departmentService.DEPARTMENT_SORT_FIELDS,
    defaultSortBy: 'name',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await departmentService.listDepartments(query);
  sendPaginated(res, items, pagination, 'Departments retrieved successfully');
});

export const getDepartment = asyncHandler(async (req: Request, res: Response) => {
  const department = await departmentService.getDepartment(paramId(req));
  sendSuccess(res, department, 'Department retrieved successfully');
});

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  const department = await departmentService.createDepartment(req.body);
  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Department',
    entityId: department.id,
    description: `Created department ${department.name}`,
    newValue: redact(department),
  });
  sendCreated(res, department, 'Department created successfully');
});

export const updateDepartment = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await departmentService.getDepartment(id);
  const department = await departmentService.updateDepartment(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Department',
    entityId: id,
    description: `Updated department ${department.name}`,
    oldValue: redact(before),
    newValue: redact(department),
  });

  sendSuccess(res, department, 'Department updated successfully');
});

export const deleteDepartment = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await departmentService.getDepartment(id);
  await departmentService.deleteDepartment(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Department',
    entityId: id,
    description: `Deleted department ${before.name}`,
    oldValue: redact(before),
  });

  sendSuccess(res, null, 'Department deleted successfully');
});

// -------------------------------------------------------------------- Courses

export const listCourses = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: courseService.COURSE_SORT_FIELDS,
    defaultSortBy: 'name',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await courseService.listCourses(query, {
    departmentId: req.query['departmentId'] as string | undefined,
  });

  sendPaginated(res, items, pagination, 'Courses retrieved successfully');
});

export const getCourse = asyncHandler(async (req: Request, res: Response) => {
  const course = await courseService.getCourse(paramId(req));
  sendSuccess(res, course, 'Course retrieved successfully');
});

export const createCourse = asyncHandler(async (req: Request, res: Response) => {
  const course = await courseService.createCourse(req.body);
  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Course',
    entityId: course.id,
    description: `Created course ${course.name}`,
    newValue: redact(course),
  });
  sendCreated(res, course, 'Course created successfully');
});

export const updateCourse = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await courseService.getCourse(id);
  const course = await courseService.updateCourse(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Course',
    entityId: id,
    description: `Updated course ${course.name}`,
    oldValue: redact(before),
    newValue: redact(course),
  });

  sendSuccess(res, course, 'Course updated successfully');
});

export const deleteCourse = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await courseService.getCourse(id);
  await courseService.deleteCourse(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Course',
    entityId: id,
    description: `Deleted course ${before.name}`,
    oldValue: redact(before),
  });

  sendSuccess(res, null, 'Course deleted successfully');
});

// -------------------------------------------------------------------- Classes

export const listClasses = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: classService.CLASS_SORT_FIELDS,
    defaultSortBy: 'yearLevel',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await classService.listClasses(query, {
    academicYearId: req.query['academicYearId'] as string | undefined,
    departmentId: req.query['departmentId'] as string | undefined,
    courseId: req.query['courseId'] as string | undefined,
  });

  sendPaginated(res, items, pagination, 'Classes retrieved successfully');
});

export const listClassOptions = asyncHandler(async (req: Request, res: Response) => {
  const options = await classService.listClassOptions(
    req.query['academicYearId'] as string | undefined,
  );
  sendSuccess(res, options, 'Class options retrieved successfully');
});

export const getClass = asyncHandler(async (req: Request, res: Response) => {
  const record = await classService.getClass(paramId(req));
  sendSuccess(res, record, 'Class retrieved successfully');
});

export const createClass = asyncHandler(async (req: Request, res: Response) => {
  const record = await classService.createClass(req.body);
  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Class',
    entityId: record.id,
    description: `Created class ${record.name}`,
    newValue: redact(record),
  });
  sendCreated(res, record, 'Class created successfully');
});

export const updateClass = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await classService.getClass(id);
  const record = await classService.updateClass(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Class',
    entityId: id,
    description: `Updated class ${record.name}`,
    oldValue: redact(before),
    newValue: redact(record),
  });

  sendSuccess(res, record, 'Class updated successfully');
});

export const deleteClass = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await classService.getClass(id);
  await classService.deleteClass(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Class',
    entityId: id,
    description: `Deleted class ${before.name}`,
    oldValue: redact(before),
  });

  sendSuccess(res, null, 'Class deleted successfully');
});

// ------------------------------------------------------------------- Sections

export const listSections = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: sectionService.SECTION_SORT_FIELDS,
    defaultSortBy: 'name',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await sectionService.listSections(query, {
    classId: req.query['classId'] as string | undefined,
  });

  sendPaginated(res, items, pagination, 'Sections retrieved successfully');
});

export const getSection = asyncHandler(async (req: Request, res: Response) => {
  const section = await sectionService.getSection(paramId(req));
  sendSuccess(res, section, 'Section retrieved successfully');
});

export const createSection = asyncHandler(async (req: Request, res: Response) => {
  const section = await sectionService.createSection(req.body);
  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Section',
    entityId: section.id,
    description: `Created section ${section.class.name} — ${section.name}`,
    newValue: redact(section),
  });
  sendCreated(res, section, 'Section created successfully');
});

export const updateSection = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await sectionService.getSection(id);
  const section = await sectionService.updateSection(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Section',
    entityId: id,
    description: `Updated section ${section.class.name} — ${section.name}`,
    oldValue: redact(before),
    newValue: redact(section),
  });

  sendSuccess(res, section, 'Section updated successfully');
});

export const deleteSection = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await sectionService.getSection(id);
  await sectionService.deleteSection(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Section',
    entityId: id,
    description: `Deleted section ${before.class.name} — ${before.name}`,
    oldValue: redact(before),
  });

  sendSuccess(res, null, 'Section deleted successfully');
});

// ------------------------------------------------------------------- Subjects

export const listSubjects = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: subjectService.SUBJECT_SORT_FIELDS,
    defaultSortBy: 'name',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await subjectService.listSubjects(query, {
    departmentId: req.query['departmentId'] as string | undefined,
    type: req.query['type'] as never,
  });

  sendPaginated(res, items, pagination, 'Subjects retrieved successfully');
});

export const listSubjectOptions = asyncHandler(async (_req: Request, res: Response) => {
  const options = await subjectService.listSubjectOptions();
  sendSuccess(res, options, 'Subject options retrieved successfully');
});

export const getSubject = asyncHandler(async (req: Request, res: Response) => {
  const subject = await subjectService.getSubject(paramId(req));
  sendSuccess(res, subject, 'Subject retrieved successfully');
});

export const createSubject = asyncHandler(async (req: Request, res: Response) => {
  const subject = await subjectService.createSubject(req.body);
  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Subject',
    entityId: subject.id,
    description: `Created subject ${subject.name}`,
    newValue: redact(subject),
  });
  sendCreated(res, subject, 'Subject created successfully');
});

export const updateSubject = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await subjectService.getSubject(id);
  const subject = await subjectService.updateSubject(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Subject',
    entityId: id,
    description: `Updated subject ${subject.name}`,
    oldValue: redact(before),
    newValue: redact(subject),
  });

  sendSuccess(res, subject, 'Subject updated successfully');
});

export const deleteSubject = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await subjectService.getSubject(id);
  await subjectService.deleteSubject(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Subject',
    entityId: id,
    description: `Deleted subject ${before.name}`,
    oldValue: redact(before),
  });

  sendSuccess(res, null, 'Subject deleted successfully');
});

// ------------------------------------------------------------------ Semesters

export const listSemesters = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: semesterService.SEMESTER_SORT_FIELDS,
    defaultSortBy: 'startDate',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await semesterService.listSemesters(query, {
    academicYearId: req.query['academicYearId'] as string | undefined,
    status: req.query['status'] as never,
  });

  sendPaginated(res, items, pagination, 'Semesters retrieved successfully');
});

export const getSemester = asyncHandler(async (req: Request, res: Response) => {
  const semester = await semesterService.getSemester(paramId(req));
  sendSuccess(res, semester, 'Semester retrieved successfully');
});

export const createSemester = asyncHandler(async (req: Request, res: Response) => {
  const semester = await semesterService.createSemester(req.body);
  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Semester',
    entityId: semester.id,
    description: `Created semester ${semester.name}`,
    newValue: redact(semester),
  });
  sendCreated(res, semester, 'Semester created successfully');
});

export const updateSemester = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await semesterService.getSemester(id);
  const semester = await semesterService.updateSemester(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Semester',
    entityId: id,
    description: `Updated semester ${semester.name}`,
    oldValue: redact(before),
    newValue: redact(semester),
  });

  sendSuccess(res, semester, 'Semester updated successfully');
});

export const deleteSemester = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await semesterService.getSemester(id);
  await semesterService.deleteSemester(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Semester',
    entityId: id,
    description: `Deleted semester ${before.name}`,
    oldValue: redact(before),
  });

  sendSuccess(res, null, 'Semester deleted successfully');
});

// ---------------------------------------------------------- Subject offerings

export const listOfferings = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: ['subject'],
    defaultSortBy: 'subject',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await classSubjectService.listOfferings(query, {
    classId: req.query['classId'] as string | undefined,
    sectionId: req.query['sectionId'] as string | undefined,
    subjectId: req.query['subjectId'] as string | undefined,
    teacherId: req.query['teacherId'] as string | undefined,
    semesterId: req.query['semesterId'] as string | undefined,
    isElective: req.query['isElective'] as boolean | undefined,
  });

  sendPaginated(res, items, pagination, 'Subject offerings retrieved successfully');
});

export const getOffering = asyncHandler(async (req: Request, res: Response) => {
  const offering = await classSubjectService.getOffering(paramId(req));
  sendSuccess(res, offering, 'Subject offering retrieved successfully');
});

export const createOffering = asyncHandler(async (req: Request, res: Response) => {
  const offering = await classSubjectService.createOffering(req.body);
  await auditFromRequest(req, {
    action: 'ASSIGN',
    module: MODULE,
    entityType: 'ClassSubject',
    entityId: offering.id,
    description: `Assigned ${offering.subject.name} to ${offering.class.name}`,
    newValue: redact(offering),
  });
  sendCreated(res, offering, 'Subject assigned successfully');
});

export const updateOffering = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await classSubjectService.getOffering(id);
  const offering = await classSubjectService.updateOffering(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'ClassSubject',
    entityId: id,
    description: `Updated offering ${offering.subject.name} for ${offering.class.name}`,
    oldValue: redact(before),
    newValue: redact(offering),
  });

  sendSuccess(res, offering, 'Subject offering updated successfully');
});

export const deleteOffering = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await classSubjectService.getOffering(id);
  await classSubjectService.deleteOffering(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'ClassSubject',
    entityId: id,
    description: `Removed ${before.subject.name} from ${before.class.name}`,
    oldValue: redact(before),
  });

  sendSuccess(res, null, 'Subject offering removed successfully');
});

// ------------------------------------------------------------------ Electives

export const listStudentElectives = asyncHandler(async (req: Request, res: Response) => {
  const electives = await classSubjectService.listStudentElectives(
    req.params['studentId'] as string,
  );
  sendSuccess(res, electives, 'Electives retrieved successfully');
});

export const setStudentElectives = asyncHandler(async (req: Request, res: Response) => {
  const studentId = req.params['studentId'] as string;
  const { classSubjectIds } = req.body as { classSubjectIds: string[] };

  const result = await classSubjectService.setStudentElectives(studentId, classSubjectIds);

  await auditFromRequest(req, {
    action: 'ASSIGN',
    module: MODULE,
    entityType: 'StudentElective',
    entityId: studentId,
    description: `Set ${result.enrolled} elective(s) for student`,
    newValue: redact({ classSubjectIds }),
  });

  sendSuccess(res, result, 'Electives updated successfully');
});
