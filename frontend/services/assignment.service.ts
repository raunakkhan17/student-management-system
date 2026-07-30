import { api } from '@/lib/api-client';
import type { PaginatedData } from '@/types/api';
import type {
  AssignmentDetail,
  AssignmentListItem,
  AssignmentQuery,
  AssignmentStats,
  AssignmentSubmission,
  CreateAssignmentFields,
  EvaluatePayload,
  UpdateAssignmentPayload,
} from '@/types/assignment';

const BASE = '/assignments';

/** Assignment create/submit are multipart, so text fields are appended as strings. */
function toFormData(fields: Record<string, string | number | boolean>, files: File[]): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, String(value));
  }
  for (const file of files) {
    formData.append('attachments', file);
  }
  return formData;
}

export const assignmentService = {
  list: (params: AssignmentQuery) =>
    api.get<PaginatedData<AssignmentListItem>>(BASE, { params }),

  get: (id: string) => api.get<AssignmentDetail>(`${BASE}/${id}`),

  getStats: () => api.get<AssignmentStats>(`${BASE}/stats`),

  create: (fields: CreateAssignmentFields, files: File[] = []) => {
    const flat: Record<string, string | number | boolean> = {
      title: fields.title,
      description: fields.description,
      classId: fields.classId,
      subjectId: fields.subjectId,
      assignedDate: fields.assignedDate,
      dueDate: fields.dueDate,
      maxMarks: fields.maxMarks,
      allowLateSubmission: fields.allowLateSubmission,
      publish: fields.publish,
    };
    if (fields.sectionId) flat['sectionId'] = fields.sectionId;

    return api.upload<AssignmentDetail>(BASE, toFormData(flat, files));
  },

  update: (id: string, payload: UpdateAssignmentPayload) =>
    api.patch<AssignmentDetail>(`${BASE}/${id}`, payload),

  remove: (id: string) => api.delete<null>(`${BASE}/${id}`),

  uploadAttachments: (id: string, files: File[]) =>
    api.upload<AssignmentDetail>(`${BASE}/${id}/attachments`, toFormData({}, files)),

  submit: (id: string, content: string, files: File[] = []) =>
    api.upload<AssignmentSubmission>(`${BASE}/${id}/submit`, toFormData({ content }, files)),

  getMySubmission: (id: string) =>
    api.get<AssignmentSubmission | null>(`${BASE}/${id}/my-submission`),

  listSubmissions: (id: string, params: AssignmentQuery & { status?: string }) =>
    api.get<PaginatedData<AssignmentSubmission>>(`${BASE}/${id}/submissions`, { params }),

  evaluate: (assignmentId: string, submissionId: string, payload: EvaluatePayload) =>
    api.post<AssignmentSubmission>(
      `${BASE}/${assignmentId}/submissions/${submissionId}/evaluate`,
      payload,
    ),
};
