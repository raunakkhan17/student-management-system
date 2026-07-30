import { api } from '@/lib/api-client';
import type { PaginatedData } from '@/types/api';
import type {
  AcademicYear,
  AcademicYearPayload,
  AcademicYearQuery,
  ClassOption,
  ClassPayload,
  ClassQuery,
  ClassRecord,
  Course,
  CoursePayload,
  CourseQuery,
  Department,
  DepartmentPayload,
  OfferingPayload,
  OfferingQuery,
  Section,
  SectionPayload,
  SectionQuery,
  Semester,
  SemesterPayload,
  SemesterQuery,
  Subject,
  SubjectOffering,
  SubjectOption,
  SubjectPayload,
  SubjectQuery,
} from '@/types/academic';
import type { ListQueryParams } from '@/types/api';

const BASE = '/academics';

export const academicService = {
  // Academic years
  listYears: (params: AcademicYearQuery) =>
    api.get<PaginatedData<AcademicYear>>(`${BASE}/academic-years`, { params }),
  getCurrentYear: () => api.get<AcademicYear>(`${BASE}/academic-years/current`),
  getYear: (id: string) => api.get<AcademicYear>(`${BASE}/academic-years/${id}`),
  createYear: (payload: AcademicYearPayload) =>
    api.post<AcademicYear>(`${BASE}/academic-years`, payload),
  updateYear: (id: string, payload: Partial<AcademicYearPayload>) =>
    api.patch<AcademicYear>(`${BASE}/academic-years/${id}`, payload),
  deleteYear: (id: string) => api.delete<null>(`${BASE}/academic-years/${id}`),

  // Departments
  listDepartments: (params: ListQueryParams) =>
    api.get<PaginatedData<Department>>(`${BASE}/departments`, { params }),
  getDepartment: (id: string) => api.get<Department>(`${BASE}/departments/${id}`),
  createDepartment: (payload: DepartmentPayload) =>
    api.post<Department>(`${BASE}/departments`, payload),
  updateDepartment: (id: string, payload: Partial<DepartmentPayload>) =>
    api.patch<Department>(`${BASE}/departments/${id}`, payload),
  deleteDepartment: (id: string) => api.delete<null>(`${BASE}/departments/${id}`),

  // Courses
  listCourses: (params: CourseQuery) =>
    api.get<PaginatedData<Course>>(`${BASE}/courses`, { params }),
  getCourse: (id: string) => api.get<Course>(`${BASE}/courses/${id}`),
  createCourse: (payload: CoursePayload) => api.post<Course>(`${BASE}/courses`, payload),
  updateCourse: (id: string, payload: Partial<CoursePayload>) =>
    api.patch<Course>(`${BASE}/courses/${id}`, payload),
  deleteCourse: (id: string) => api.delete<null>(`${BASE}/courses/${id}`),

  // Classes
  listClasses: (params: ClassQuery) =>
    api.get<PaginatedData<ClassRecord>>(`${BASE}/classes`, { params }),
  listClassOptions: (academicYearId?: string) =>
    api.get<ClassOption[]>(`${BASE}/classes/options`, {
      params: academicYearId ? { academicYearId } : {},
    }),
  getClass: (id: string) => api.get<ClassRecord>(`${BASE}/classes/${id}`),
  createClass: (payload: ClassPayload) => api.post<ClassRecord>(`${BASE}/classes`, payload),
  updateClass: (id: string, payload: Partial<ClassPayload>) =>
    api.patch<ClassRecord>(`${BASE}/classes/${id}`, payload),
  deleteClass: (id: string) => api.delete<null>(`${BASE}/classes/${id}`),

  // Sections
  listSections: (params: SectionQuery) =>
    api.get<PaginatedData<Section>>(`${BASE}/sections`, { params }),
  getSection: (id: string) => api.get<Section>(`${BASE}/sections/${id}`),
  createSection: (payload: SectionPayload) => api.post<Section>(`${BASE}/sections`, payload),
  updateSection: (id: string, payload: Partial<Omit<SectionPayload, 'classId'>>) =>
    api.patch<Section>(`${BASE}/sections/${id}`, payload),
  deleteSection: (id: string) => api.delete<null>(`${BASE}/sections/${id}`),

  // Subjects
  listSubjects: (params: SubjectQuery) =>
    api.get<PaginatedData<Subject>>(`${BASE}/subjects`, { params }),
  listSubjectOptions: () => api.get<SubjectOption[]>(`${BASE}/subjects/options`),
  getSubject: (id: string) => api.get<Subject>(`${BASE}/subjects/${id}`),
  createSubject: (payload: SubjectPayload) => api.post<Subject>(`${BASE}/subjects`, payload),
  updateSubject: (id: string, payload: Partial<SubjectPayload>) =>
    api.patch<Subject>(`${BASE}/subjects/${id}`, payload),
  deleteSubject: (id: string) => api.delete<null>(`${BASE}/subjects/${id}`),

  // Semesters
  listSemesters: (params: SemesterQuery) =>
    api.get<PaginatedData<Semester>>(`${BASE}/semesters`, { params }),
  getSemester: (id: string) => api.get<Semester>(`${BASE}/semesters/${id}`),
  createSemester: (payload: SemesterPayload) => api.post<Semester>(`${BASE}/semesters`, payload),
  updateSemester: (id: string, payload: Partial<Omit<SemesterPayload, 'academicYearId'>>) =>
    api.patch<Semester>(`${BASE}/semesters/${id}`, payload),
  deleteSemester: (id: string) => api.delete<null>(`${BASE}/semesters/${id}`),

  // Subject offerings
  listOfferings: (params: OfferingQuery) =>
    api.get<PaginatedData<SubjectOffering>>(`${BASE}/offerings`, { params }),
  createOffering: (payload: OfferingPayload) =>
    api.post<SubjectOffering>(`${BASE}/offerings`, payload),
  updateOffering: (
    id: string,
    payload: Partial<Pick<OfferingPayload, 'teacherId' | 'semesterId' | 'isElective'>>,
  ) => api.patch<SubjectOffering>(`${BASE}/offerings/${id}`, payload),
  deleteOffering: (id: string) => api.delete<null>(`${BASE}/offerings/${id}`),

  // Electives
  listStudentElectives: (studentId: string) =>
    api.get<unknown[]>(`${BASE}/students/${studentId}/electives`),
  setStudentElectives: (studentId: string, classSubjectIds: string[]) =>
    api.put<{ enrolled: number }>(`${BASE}/students/${studentId}/electives`, { classSubjectIds }),
};
