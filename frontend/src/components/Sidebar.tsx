import { useRef, useState } from 'react'
import { duplicateOf, errorText, uploadDocument } from '../api'
import type { Doc } from '../types'

const MAX_BYTES = 20 * 1024 * 1024

interface Props {
  docs: Doc[]
  selected: string | null
  onChoose: (id: string) => void
  onUploaded: (id: string) => Promise<void>
  onToast: (message: string) => void
}

export function Sidebar({ docs, selected, onChoose, onUploaded, onToast }: Props) {
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [activity, setActivity] = useState<{ key: number; text: string }[]>([])
  const busyRef = useRef(false)
  const counter = useRef(0)
  const input = useRef<HTMLInputElement>(null)

  // One file at a time, so each line reports its own result and duplicates select the existing document.
  const upload = async (files: File[]) => {
    if (!files.length) return
    if (busyRef.current) {
      onToast('Please wait for the current upload batch.')
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      for (const file of files) {
        const key = ++counter.current
        const say = (text: string) =>
          setActivity((lines) => (lines.some((l) => l.key === key) ? lines.map((l) => (l.key === key ? { key, text } : l)) : [...lines, { key, text }]))
        say(`${file.name} · uploading…`)
        if (file.size > MAX_BYTES) {
          say(`${file.name} · exceeds 20 MB`)
          continue
        }
        try {
          const doc = await uploadDocument(file)
          say(`${file.name} · queued`)
          await onUploaded(doc.id)
        } catch (error) {
          say(`${file.name} · ${errorText(error)}`)
          const existing = duplicateOf(error)
          if (existing) await onUploaded(existing)
        }
      }
    } finally {
      busyRef.current = false
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <aside>
      <div className="eyebrow">Patient workspace</div>
      <div className="patient">
        <div className="avatar">01</div>
        <h3>Synthetic patient 001</h3>
        <p className="muted">One patient · local document collection</p>
      </div>
      <div
        className={`upload ${drag ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          void upload(Array.from(e.dataTransfer.files))
        }}
      >
        <label htmlFor="files">
          <h3>Add medical reports</h3>
          <p className="muted">Drop PDF or UTF-8 text files here</p>
        </label>
        <input
          id="files"
          ref={input}
          type="file"
          multiple
          accept=".pdf,.txt"
          aria-label="Upload reports"
          disabled={busy}
          onChange={(e) => void upload(Array.from(e.target.files ?? []))}
        />
        <p className="muted">20 MB / file · PDF limit: 100 pages</p>
        <div className="activity" role="status" aria-live="polite">
          {activity.map((line) => (
            <p key={line.key}>{line.text}</p>
          ))}
        </div>
      </div>
      <div className="list-head">
        <span className="eyebrow">Uploaded documents</span>
        <span className="muted">{docs.length}</span>
      </div>
      <div>
        {docs.map((d) => (
          <button key={d.id} className={`doc ${d.id === selected ? 'active' : ''}`} onClick={() => onChoose(d.id)}>
            <strong>{d.filename}</strong>
            <small>{d.report_date ?? 'Date unknown'} · </small>
            <span className={`status ${d.status}`}>{d.status}</span>
          </button>
        ))}
      </div>
      <p className="footer">Original files and extracted text are saved locally. Use synthetic reports for this demo.</p>
    </aside>
  )
}
