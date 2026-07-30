import { Router } from 'express';
import * as controller from '@/controllers/academic.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import {
  academicYearQuerySchema,
  classQuerySchema,
  classSubjectQuerySchema,
  courseQuerySchema,
  createAcademicYearSchema,
  createClassSchema,
  createClassSubjectSchema,
  createCourseSchema,
  createDepartmentSchema,
  createSectionSchema,
  createSemesterSchema,
  createSubjectSchema,
  departmentQuerySchema,
  sectionQuerySchema,
  semesterQuerySchema,
  setStudentElectivesSchema,
  subjectQuerySchema,
  updateAcademicYearSchema,
  updateClassSchema,
  updateClassSubjectSchema,
  updateCourseSchema,
  updateDepartmentSchema,
  updateSectionSchema,
  updateSemesterSchema,
  updateSubjectSchema,
} from '@/validators/academic.validator';
import { uuidParamSchema } from '@/validators/common.validator';
import { z } from 'zod';

const router = Router();

router.use(authenticate);

const canView = requirePermission('ACADEMICS', 'VIEW');
const canCreate = requirePermission('ACADEMICS', 'CREATE');
const canEdit = requirePermission('ACADEMICS', 'EDIT');
const canDelete = requirePermission('ACADEMICS', 'DELETE');
const canAssign = requirePermission('ACADEMICS', 'ASSIGN');

const studentIdParam = z.object({ studentId: z.string().uuid() });

// ----------------------------------------------------------- Academic years
router
  .route('/academic-years')
  .get(canView, validate({ query: academicYearQuerySchema }), controller.listAcademicYears)
  .post(canCreate, validate({ body: createAcademicYearSchema }), controller.createAcademicYear);

router.get('/academic-years/current', canView, controller.getCurrentAcademicYear);

router
  .route('/academic-years/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getAcademicYear)
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateAcademicYearSchema }),
    controller.updateAcademicYear,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteAcademicYear);

// --------------------------------------------------------------- Departments
router
  .route('/departments')
  .get(canView, validate({ query: departmentQuerySchema }), controller.listDepartments)
  .post(canCreate, validate({ body: createDepartmentSchema }), controller.createDepartment);

router
  .route('/departments/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getDepartment)
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateDepartmentSchema }),
    controller.updateDepartment,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteDepartment);

// ------------------------------------------------------------------- Courses
router
  .route('/courses')
  .get(canView, validate({ query: courseQuerySchema }), controller.listCourses)
  .post(canCreate, validate({ body: createCourseSchema }), controller.createCourse);

router
  .route('/courses/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getCourse)
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateCourseSchema }),
    controller.updateCourse,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteCourse);

// ------------------------------------------------------------------- Classes
router
  .route('/classes')
  .get(canView, validate({ query: classQuerySchema }), controller.listClasses)
  .post(canCreate, validate({ body: createClassSchema }), controller.createClass);

router.get('/classes/options', canView, controller.listClassOptions);

router
  .route('/classes/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getClass)
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateClassSchema }),
    controller.updateClass,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteClass);

// ------------------------------------------------------------------ Sections
router
  .route('/sections')
  .get(canView, validate({ query: sectionQuerySchema }), controller.listSections)
  .post(canCreate, validate({ body: createSectionSchema }), controller.createSection);

router
  .route('/sections/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getSection)
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateSectionSchema }),
    controller.updateSection,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteSection);

// ------------------------------------------------------------------ Subjects
router
  .route('/subjects')
  .get(canView, validate({ query: subjectQuerySchema }), controller.listSubjects)
  .post(canCreate, validate({ body: createSubjectSchema }), controller.createSubject);

router.get('/subjects/options', canView, controller.listSubjectOptions);

router
  .route('/subjects/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getSubject)
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateSubjectSchema }),
    controller.updateSubject,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteSubject);

// ----------------------------------------------------------------- Semesters
router
  .route('/semesters')
  .get(canView, validate({ query: semesterQuerySchema }), controller.listSemesters)
  .post(canCreate, validate({ body: createSemesterSchema }), controller.createSemester);

router
  .route('/semesters/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getSemester)
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateSemesterSchema }),
    controller.updateSemester,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteSemester);

// --------------------------------------------------------- Subject offerings
router
  .route('/offerings')
  .get(canView, validate({ query: classSubjectQuerySchema }), controller.listOfferings)
  .post(canAssign, validate({ body: createClassSubjectSchema }), controller.createOffering);

router
  .route('/offerings/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getOffering)
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateClassSubjectSchema }),
    controller.updateOffering,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteOffering);

// ----------------------------------------------------------------- Electives
router
  .route('/students/:studentId/electives')
  .get(canView, validate({ params: studentIdParam }), controller.listStudentElectives)
  .put(
    canAssign,
    validate({ params: studentIdParam, body: setStudentElectivesSchema }),
    controller.setStudentElectives,
  );

export default router;
