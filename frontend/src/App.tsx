import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { errorText, extractEvents, getFindings, listDocuments, postCorrection, retryProcessing, saveReportDate } from './api'
import { DocumentDetails } from './components/DocumentDetails'
import { DocumentView } from './components/DocumentView'
import { ObservationPanel } from './components/ObservationPanel'
import { Sidebar } from './components/Sidebar'
import { Timeline } from './components/Timeline'
import { conceptSuggestions, DEFAULT_FILTERS, observationIndex, type Filters } from './lib/timeline'
import type { CorrectionRequest, Doc, FindingsPayload, Observation } from './types'

const EMPTY: FindingsPayload = { findings: [], links: [], unresolved: [], rejected: [], corrections: [] }
export type View = 'documents' | 'timeline'
export type Tab = 'text' | 'original'

/** Shared by the timeline and the document view: what a correction control needs. */
export interface ReviewContext {
  corrections: FindingsPayload['corrections']
  suggestions: string[]
  onCorrect: (request: CorrectionRequest) => Promise<boolean>
}

export default function App() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [linked, setLinked] = useState<FindingsPayload>(EMPTY)
  const [offline, setOffline] = useState(false)
  const [view, setViewState] = useState<View>(() => (window.location.hash === '#timeline' ? 'timeline' : 'documents'))
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('text')
  const [activeSegment, setActiveSegment] = useState<string | null>(null)
  const [activeEvent, setActiveEvent] = useState<string | null>(null)
  const [selectedObservation, setSelectedObservation] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [toast, setToast] = useState<string | null>(null)
  const signature = useRef('')

  // Poll both endpoints; state only changes when a payload does, so inputs being edited are not reset.
  const refresh = useCallback(async () => {
    try {
      const [nextDocs, nextLinked] = await Promise.all([listDocuments(), getFindings()])
      setOffline(false)
      const next = JSON.stringify([nextDocs, nextLinked])
      if (next === signature.current) return
      signature.current = next
      setDocs(nextDocs)
      setLinked(nextLinked)
      setSelectedDoc((current) => current ?? nextDocs[0]?.id ?? null)
    } catch {
      setOffline(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2000)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const observations = useMemo(() => observationIndex(linked), [linked])
  const byEvent = useMemo(() => {
    const index = new Map<string, Observation>()
    for (const o of observations.values()) index.set(o.event_id, o)
    return index
  }, [observations])
  const suggestions = useMemo(() => conceptSuggestions(linked), [linked])
  const doc = docs.find((d) => d.id === selectedDoc) ?? null

  const setView = (next: View) => {
    setViewState(next)
    window.history.replaceState(null, '', next === 'timeline' ? '#timeline' : window.location.pathname)
  }

  const chooseDocument = (id: string) => {
    setSelectedDoc(id)
    setActiveSegment(null)
    setActiveEvent(null)
  }

  /** Open an event's source passage in the document view (text tab) or its original page. */
  const showEvent = (reportId: string, eventId: string, nextTab: Tab = 'text') => {
    const event = docs.find((d) => d.id === reportId)?.extraction?.events.find((e) => e.id === eventId)
    setView('documents')
    setSelectedDoc(reportId)
    setActiveEvent(eventId)
    setActiveSegment(event?.evidence.segment_id ?? null)
    setTab(nextTab)
  }

  const run = async (action: () => Promise<unknown>, done?: string) => {
    try {
      await action()
      if (done) setToast(done)
      await refresh()
      return true
    } catch (error) {
      setToast(errorText(error))
      await refresh()
      return false
    }
  }

  const review: ReviewContext = {
    corrections: linked.corrections,
    suggestions,
    onCorrect: (request) => run(() => postCorrection(request), 'Correction saved to the log.'),
  }

  return (
    <>
      <header>
        <div className="brand">ClinGraph<span> / </span>document workspace</div>
        <nav className="views" aria-label="Views">
          <button className={view === 'documents' ? 'active' : ''} aria-pressed={view === 'documents'} onClick={() => setView('documents')}>
            Documents
          </button>
          <button className={view === 'timeline' ? 'active' : ''} aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>
            Timeline{linked.findings.length ? ` · ${linked.findings.length}` : ''}
          </button>
        </nav>
        <div className="header-end">
          <a href="/reference.html">Reference studio ↗</a>
          <span className="tag">PHASE 06 · TIMELINE &amp; CORRECTIONS</span>
        </div>
      </header>
      <div className={`layout ${view}`}>
        <Sidebar
          docs={docs}
          selected={selectedDoc}
          onChoose={(id) => {
            chooseDocument(id)
            setView('documents')
          }}
          onUploaded={async (id) => {
            chooseDocument(id)
            await refresh()
          }}
          onToast={setToast}
        />
        <main>
          {offline && (
            <div className="notice error" role="alert">
              Local server unavailable. Start the workspace with start.ps1 (Windows) or start.sh (macOS/Linux).
            </div>
          )}
          {view === 'documents' ? (
            <DocumentView
              doc={doc}
              tab={tab}
              onTab={setTab}
              activeSegment={activeSegment}
              activeEvent={activeEvent}
              onInspect={(segmentId) => {
                setActiveSegment(segmentId)
                setActiveEvent(null)
              }}
              onSelectEvent={(event) => {
                setActiveEvent(event.id)
                setActiveSegment(event.evidence.segment_id)
                setTab('text')
              }}
              byEvent={byEvent}
              review={review}
              onExtract={(id) => run(() => extractEvents(id))}
              onRetry={(id) => run(() => retryProcessing(id))}
              onOpenTimeline={(observationId) => {
                setSelectedObservation(observationId)
                setView('timeline')
              }}
            />
          ) : (
            <Timeline
              docs={docs}
              linked={linked}
              filters={filters}
              onFilters={setFilters}
              selected={selectedObservation}
              onSelect={setSelectedObservation}
              onDocuments={() => setView('documents')}
            />
          )}
          <p className="footer">
            Extracted events are model proposals with verified source passages. A review status records a reviewer’s decision; neither
            establishes clinical correctness.
          </p>
        </main>
        <section className="right" aria-label={view === 'documents' ? 'Document details' : 'Selected event'}>
          {view === 'documents' ? (
            <DocumentDetails
              doc={doc}
              activeSegment={activeSegment}
              onOriginal={() => setTab('original')}
              onSaveDate={(id, date) => run(() => saveReportDate(id, date), 'Report date saved.')}
            />
          ) : (
            <ObservationPanel
              observation={selectedObservation ? observations.get(selectedObservation) ?? null : null}
              selectedId={selectedObservation}
              docs={docs}
              linked={linked}
              observations={observations}
              review={review}
              onShow={showEvent}
            />
          )}
        </section>
      </div>
      <div id="toast" className={toast ? '' : 'hidden'} role="status" aria-live="polite">
        {toast}
      </div>
    </>
  )
}
