import { api, httpClient } from '@/lib/api-client';
import type { ListQueryParams, PaginatedData } from '@/types/api';
import type {
  AddCopiesPayload,
  Author,
  Book,
  BookCategory,
  BookCopyListItem,
  BookDetail,
  BookPayload,
  BookQuery,
  BookReservation,
  BookTransaction,
  CopyQuery,
  IssueBookPayload,
  LibraryMember,
  LibrarySettings,
  LibraryStats,
  MemberLoanSummary,
  Publisher,
  RenewBookPayload,
  ReturnBookPayload,
  Shelf,
  TransactionQuery,
  UpdateCopyPayload,
} from '@/types/library';

const BASE = '/library';

export const libraryService = {
  // Overview
  getStats: () => api.get<LibraryStats>(`${BASE}/stats`),
  getMyLoans: () => api.get<MemberLoanSummary>(`${BASE}/my-loans`),
  getMemberLoans: (memberId: string) =>
    api.get<MemberLoanSummary>(`${BASE}/members/${memberId}/loans`),
  searchMembers: (search?: string) =>
    api.get<LibraryMember[]>(`${BASE}/members`, { params: search ? { search } : {} }),

  // Settings
  getSettings: () => api.get<LibrarySettings>(`${BASE}/settings`),
  saveSettings: (payload: LibrarySettings) =>
    api.put<LibrarySettings>(`${BASE}/settings`, payload),

  // Taxonomy
  listCategories: (params: ListQueryParams) =>
    api.get<PaginatedData<BookCategory>>(`${BASE}/categories`, { params }),
  createCategory: (payload: { name: string; code: string; description?: string }) =>
    api.post<BookCategory>(`${BASE}/categories`, payload),
  deleteCategory: (id: string) => api.delete<null>(`${BASE}/categories/${id}`),

  listAuthors: (params: ListQueryParams) =>
    api.get<PaginatedData<Author>>(`${BASE}/authors`, { params }),
  createAuthor: (payload: { name: string; biography?: string }) =>
    api.post<Author>(`${BASE}/authors`, payload),

  listPublishers: (params: ListQueryParams) =>
    api.get<PaginatedData<Publisher>>(`${BASE}/publishers`, { params }),
  createPublisher: (payload: {
    name: string;
    address?: string;
    contact?: string;
    email?: string;
  }) => api.post<Publisher>(`${BASE}/publishers`, payload),

  listShelves: (params: ListQueryParams) =>
    api.get<PaginatedData<Shelf>>(`${BASE}/shelves`, { params }),
  createShelf: (payload: {
    code: string;
    name: string;
    location?: string;
    capacity: number;
  }) => api.post<Shelf>(`${BASE}/shelves`, payload),
  deleteShelf: (id: string) => api.delete<null>(`${BASE}/shelves/${id}`),

  // Books
  listBooks: (params: BookQuery) => api.get<PaginatedData<Book>>(`${BASE}/books`, { params }),
  getBook: (id: string) => api.get<BookDetail>(`${BASE}/books/${id}`),
  createBook: (payload: BookPayload) => api.post<Book>(`${BASE}/books`, payload),
  updateBook: (id: string, payload: Partial<Omit<BookPayload, 'isbn'>>) =>
    api.patch<Book>(`${BASE}/books/${id}`, payload),
  deleteBook: (id: string) => api.delete<null>(`${BASE}/books/${id}`),
  addCopies: (bookId: string, payload: AddCopiesPayload) =>
    api.post<Book>(`${BASE}/books/${bookId}/copies`, payload),

  // Copies
  listCopies: (params: CopyQuery) =>
    api.get<PaginatedData<BookCopyListItem>>(`${BASE}/copies`, { params }),
  updateCopy: (copyId: string, payload: UpdateCopyPayload) =>
    api.patch<BookCopyListItem>(`${BASE}/copies/${copyId}`, payload),
  getCopyQrCode: (copyId: string) =>
    api.get<{ dataUrl: string }>(`${BASE}/copies/${copyId}/qr`),

  // Circulation
  listTransactions: (params: TransactionQuery) =>
    api.get<PaginatedData<BookTransaction>>(`${BASE}/transactions`, { params }),
  issueBook: (payload: IssueBookPayload) => api.post<BookTransaction>(`${BASE}/issue`, payload),
  returnBook: (id: string, payload: ReturnBookPayload) =>
    api.post<BookTransaction>(`${BASE}/transactions/${id}/return`, payload),
  renewBook: (id: string, payload: RenewBookPayload) =>
    api.post<BookTransaction>(`${BASE}/transactions/${id}/renew`, payload),
  payFine: (id: string, remarks?: string) =>
    api.post<BookTransaction>(`${BASE}/transactions/${id}/pay-fine`, remarks ? { remarks } : {}),
  refreshOverdue: () =>
    api.post<{ flagged: number; totalFines: string }>(`${BASE}/overdue/refresh`),

  // Reservations
  reserveBook: (payload: { bookId: string; holdDays: number }) =>
    api.post<BookReservation>(`${BASE}/reserve`, payload),
  cancelReservation: (id: string) => api.post<null>(`${BASE}/reservations/${id}/cancel`),

  /** Streams a file, so it bypasses the JSON envelope unwrapping. */
  exportCatalogue: async (format: 'csv' | 'xlsx') => {
    const response = await httpClient.get<Blob>(`${BASE}/reports/catalogue`, {
      params: { format },
      responseType: 'blob',
    });
    return response.data;
  },
};
