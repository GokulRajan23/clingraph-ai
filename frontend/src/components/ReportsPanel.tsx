import { useRef } from 'react'
import type { Notice, Upload } from '../App'

interface Props {
  uploads: Upload[]
  notice: Notice | null
  onAdd: (files: File[]) => void
  onRemove: (id: string) => void
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ReportsPanel({ uploads, notice, onAdd, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const processed = uploads.filter((u) => u.status === 'processed').length

  return (
    <section className="panel reports-panel" aria-labelledby="reports-title">
      <div className="panel-head">
        <h2 id="reports-title">Reports</h2>
      </div>
      <button className="primary upload-button" onClick={() => input.current?.click()}>
        <span aria-hidden="true">+</span> Upload reports
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(event) => {
          onAdd([...(event.target.files ?? [])])
          event.target.value = ''
        }}
      />
      <p className="muted">
        {uploads.length === 0 ? 'PDF files · drag and drop supported' : `${processed} of ${uploads.length} processed`}
      </p>
      {notice && (
        <p key={notice.id} className="notice" role="alert">
          {notice.text}
        </p>
      )}
      <ul className="report-list">
        {uploads.map((upload) => (
          <li key={upload.id} className="report-row">
            <span className="pdf-badge" aria-hidden="true">
              PDF
            </span>
            <span className="report-meta">
              <span className="report-name" title={upload.file.name}>
                {upload.file.name}
              </span>
              <span className="report-sub">
                <span className="muted">{formatSize(upload.file.size)}</span>
                {upload.status === 'processing' ? (
                  <span className="status processing" role="status">
                    <span className="spinner" aria-hidden="true" />
                    Processing
                  </span>
                ) : (
                  <span className="status processed">
                    <span aria-hidden="true">✓</span> Processed
                  </span>
                )}
              </span>
            </span>
            <button className="icon-button" onClick={() => onRemove(upload.id)} aria-label={`Remove ${upload.file.name}`}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
