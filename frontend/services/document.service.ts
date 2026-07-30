import { api } from '@/lib/api-client';
import type { PaginatedData } from '@/types/api';
import type {
  DocumentQuery,
  DocumentStats,
  DocumentType,
  ExpiringDocument,
  StudentDocument,
  UpdateDocumentPayload,
  VerifyDocumentPayload,
} from '@/types/document';

const BASE = '/documents';

export interface UploadDocumentFields {
  type: DocumentType;
  title: string;
  studentId?: string | null;
  teacherId?: string | null;
  issuedDate?: string;
  expiryDate?: string;
  remarks?: string;
}

export const documentService = {
  getStats: () => api.get<DocumentStats>(`${BASE}/stats`),
  listExpiring: () => api.get<ExpiringDocument[]>(`${BASE}/expiring`),

  list: (params: DocumentQuery) => api.get<PaginatedData<StudentDocument>>(BASE, { params }),
  get: (id: string) => api.get<StudentDocument>(`${BASE}/${id}`),

  /** The file and its metadata are sent together as one multipart request. */
  upload: (file: File, fields: UploadDocumentFields) => {
    const formData = new FormData();
    formData.append('file', file);

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null && value !== '') {
        formData.append(key, String(value));
      }
    }

    return api.upload<StudentDocument>(BASE, formData);
  },

  update: (id: string, payload: UpdateDocumentPayload) =>
    api.patch<StudentDocument>(`${BASE}/${id}`, payload),
  verify: (id: string, payload: VerifyDocumentPayload) =>
    api.post<StudentDocument>(`${BASE}/${id}/verify`, payload),
  remove: (id: string) => api.delete<null>(`${BASE}/${id}`),
};
