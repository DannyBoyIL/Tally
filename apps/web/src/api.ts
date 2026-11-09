import type { DocumentSummary, DocumentView, EventInput } from '@tally/shared';

export class ApiError extends Error {
  override name = 'ApiError';
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(body.error ?? response.statusText, response.status);
  return body as T;
}

export const api = {
  list: () => request<DocumentSummary[]>('/api/documents'),
  get: (id: string) => request<DocumentView>(`/api/documents/${id}`),
  upload(file: File) {
    const form = new FormData();
    form.append('file', file);
    return request<DocumentView>('/api/documents', { method: 'POST', body: form });
  },
  act: (id: string, event: EventInput) =>
    request<DocumentView>(`/api/documents/${id}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    }),
  imageUrl: (id: string) => `/api/documents/${id}/image`,
};
