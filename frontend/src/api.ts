import type { Correction, CorrectionRequest, Doc, FindingsPayload, Observation } from './types'

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown
  constructor(status: number, detail: unknown) {
    super(`HTTP ${status}`)
    this.status = status
    this.detail = detail
  }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, options)
  if (!response.ok) {
    let detail: unknown = null
    try {
      detail = ((await response.json()) as { detail?: unknown }).detail
    } catch {
      // Not JSON (e.g. a proxy error page); the status alone is reported.
    }
    throw new ApiError(response.status, detail)
  }
  return (await response.json()) as T
}

/** Readable message for API errors: string detail, duplicate {message}, or FastAPI 422 lists. */
export function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Unable to contact the local server.'
  const detail = error.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => (item && typeof item === 'object' && 'msg' in item ? String(item.msg) : String(item))).join('; ')
  }
  if (detail && typeof detail === 'object' && 'message' in detail) return String(detail.message)
  return `The request failed (HTTP ${error.status}).`
}

/** The id of the existing document when an upload is rejected as a duplicate. */
export function duplicateOf(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const detail = error.detail
  return detail && typeof detail === 'object' && 'document_id' in detail ? String(detail.document_id) : null
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const listDocuments = () => api<Doc[]>('/api/documents')
export const getFindings = () => api<FindingsPayload>('/api/findings')
export const uploadDocument = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api<Doc>('/api/documents', { method: 'POST', body: form })
}
export const extractEvents = (id: string) => api<Doc>(`/api/documents/${id}/extract`, { method: 'POST' })
export const retryProcessing = (id: string) => api<Doc>(`/api/documents/${id}/retry`, { method: 'POST' })
export const saveReportDate = (id: string, reportDate: string | null) =>
  api<Doc>(`/api/documents/${id}/date`, { ...json({ report_date: reportDate }), method: 'PATCH' })
export const postCorrection = (body: CorrectionRequest) =>
  api<{ correction: Correction; observation: Observation }>('/api/corrections', json(body))
export const originalUrl = (id: string) => `/api/documents/${id}/original`
