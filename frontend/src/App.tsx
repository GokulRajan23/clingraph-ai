import { useEffect, useRef, useState, type DragEvent } from 'react'
import { ask, fetchGraph, fetchSuggestions, fetchTimeline, processReports, voiceStatus } from './api'
import { historyOf, speechText, type Answer } from './chat/script'
import { ChatPanel, type VoiceControls } from './components/ChatPanel'
import { CentrePanel, VIEWS } from './components/CentrePanel'
import { ReportsPanel } from './components/ReportsPanel'
import type { Timeline } from './graph/timeline'
import type { Graph } from './graph/types'
import { usePersistentChoice } from './persist'
import { useSpeech } from './voice/useSpeech'
import { useVoiceInput } from './voice/useVoiceInput'

export interface Upload {
  id: string
  file: File
  status: 'processing' | 'processed'
}

/** What the graph is highlighting: a clicked node's neighbourhood, or the nodes a chat answer is about. */
export type Focus = { kind: 'node'; id: string } | { kind: 'answer'; messageId: string; ids: string[] } | null

export interface AnswerMessage {
  id: string
  role: 'assistant'
  answer: Answer
}
export type Message = { id: string; role: 'user'; text: string; spoken: boolean } | AnswerMessage

/** `id` changes on every notice, so a repeated message restarts its timer and is re-announced. */
export interface Notice {
  id: string
  text: string
}

let sequence = 0
const nextId = (prefix: string) => `${prefix}-${++sequence}`

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function App() {
  const [uploads, setUploads] = useState<Upload[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [loaded, setLoaded] = useState<{ key: string; graph: Graph } | null>(null)
  const [focus, setFocus] = useState<Focus>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [pending, setPending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [loadedTimeline, setLoadedTimeline] = useState<{ graph: Graph; timeline: Timeline } | null>(null)
  const [view, setView] = usePersistentChoice('clingraph.view', 'graph', VIEWS)
  const [centre, setCentre] = usePersistentChoice('clingraph.centre', 'expanded', ['expanded', 'collapsed'] as const)
  // Bumped when the chat is reset, so an answer still in flight is dropped.
  const conversation = useRef(0)

  // The graph covers the processed reports, named in upload order.
  const processed = uploads.filter((u) => u.status === 'processed').map((u) => u.file.name)
  const graphKey = processed.length > 0 ? JSON.stringify(processed) : ''
  const graph = graphKey ? (loaded?.graph ?? null) : null
  const busy = uploads.some((u) => u.status === 'processing') || (graphKey !== '' && loaded?.key !== graphKey)
  // While the next graph's timeline loads, the previous one stays on screen (under the busy
  // overlay) so the view is not torn down and rebuilt on every upload or removal.
  const timeline = graph ? (loadedTimeline?.timeline ?? null) : null
  const timelineStale = graph !== null && loadedTimeline?.graph !== graph

  useEffect(() => {
    if (!graphKey) return
    let live = true
    void fetchGraph(JSON.parse(graphKey) as string[]).then((next) => {
      if (live) setLoaded({ key: graphKey, graph: next })
    })
    return () => {
      live = false
    }
  }, [graphKey])

  useEffect(() => {
    if (!graph) return
    let live = true
    void fetchTimeline(graph).then((next) => {
      if (live) setLoadedTimeline({ graph, timeline: next })
    })
    return () => {
      live = false
    }
  }, [graph])

  useEffect(() => {
    if (!graph) return
    let live = true
    void fetchSuggestions().then((next) => {
      if (live) setSuggestions(next)
    })
    return () => {
      live = false
    }
  }, [graph])

  // With every report removed, start over: no graph from the previous session may reappear.
  useEffect(() => {
    if (uploads.length === 0) {
      setLoaded(null)
      setLoadedTimeline(null)
    }
  }, [uploads.length])

  useEffect(() => {
    void voiceStatus().then(setVoiceEnabled)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const addFiles = (files: File[]) => {
    if (files.length === 0) return
    const pdfs = files.filter(isPdf)
    const fresh = pdfs.filter((file, i) => !uploads.some((u) => sameFile(u.file, file)) && pdfs.findIndex((f) => sameFile(f, file)) === i)
    const skipped = [
      files.length > pdfs.length && `skipped ${plural(files.length - pdfs.length, 'file')} that ${files.length - pdfs.length === 1 ? 'is' : 'are'} not PDF`,
      pdfs.length > fresh.length && `${plural(pdfs.length - fresh.length, 'report')} already uploaded`,
    ].filter(Boolean)
    setNotice(skipped.length ? { id: nextId('notice'), text: `Only new PDF reports are added: ${skipped.join(', ')}.` } : null)
    if (fresh.length === 0) return

    const batch: Upload[] = fresh.map((file) => ({ id: nextId('report'), file, status: 'processing' }))
    const ids = new Set(batch.map((u) => u.id))
    setUploads((current) => [...current, ...batch])
    void processReports(fresh).then(() => {
      setUploads((current) => current.map((u) => (ids.has(u.id) ? { ...u, status: 'processed' } : u)))
    })
  }

  const speech = useSpeech()

  // Removing a report rebuilds the graph and renames report nodes, so earlier answers would cite
  // the wrong files: the conversation starts over.
  const removeUpload = (id: string) => {
    setUploads((current) => current.filter((u) => u.id !== id))
    conversation.current += 1
    setMessages([])
    setPending(false)
    setFocus(null)
    speech.reset()
    voiceInput.cancel()
  }

  /** Asks a question; answers to spoken questions are read aloud. */
  const askQuestion = async (question: string, spoken = false) => {
    const turn = conversation.current
    speech.stop()
    if (!graph) return
    const history = historyOf(messages)
    setMessages((current) => [...current, { id: nextId('question'), role: 'user', text: question, spoken }])
    setPending(true)
    const answer = await ask(question, graph, history)
    if (turn !== conversation.current) return
    const id = nextId('answer')
    setMessages((current) => [...current, { id, role: 'assistant', answer }])
    setPending(false)
    if (answer.highlight.length > 0) setFocus({ kind: 'answer', messageId: id, ids: answer.highlight })
    if (spoken && voiceEnabled) void speech.play(id, speechText(answer))
  }

  const voiceInput = useVoiceInput((text) => void askQuestion(text, true))
  const voice: VoiceControls = {
    enabled: voiceEnabled,
    input: voiceInput.state,
    playingId: speech.playingId,
    loadingId: speech.loadingId,
    error: voiceInput.error ?? speech.error,
    level: voiceInput.level,
    onCancel: voiceInput.cancel,
    onMic: () => {
      if (voiceInput.state === 'recording') return voiceInput.stop()
      speech.stop()
      speech.unlock()
      speech.clearError()
      void voiceInput.start()
    },
    onPlay: (message) => {
      speech.unlock()
      voiceInput.clearError()
      void speech.play(message.id, speechText(message.answer))
    },
    onStop: speech.stop,
  }

  const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files')

  return (
    <div
      className="app"
      onDragOver={(event) => {
        if (!carriesFiles(event)) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return
        event.preventDefault()
        setDragging(false)
        addFiles([...event.dataTransfer.files])
      }}
    >
      <header>
        <div className="brand">
          Clin<span>Graph</span> AI
        </div>
        <p className="tagline">From medical reports to a connected patient history</p>
      </header>
      <main className={`workspace${centre === 'collapsed' ? ' centre-collapsed' : ''}`}>
        <ReportsPanel uploads={uploads} notice={notice} onAdd={addFiles} onRemove={removeUpload} />
        <CentrePanel
          graph={graph}
          timeline={timeline}
          busy={busy || timelineStale}
          focus={focus}
          onFocus={setFocus}
          view={view}
          onView={setView}
          collapsed={centre === 'collapsed'}
          onCollapsed={(collapsed) => setCentre(collapsed ? 'collapsed' : 'expanded')}
        />
        <ChatPanel
          graph={graph}
          reportCount={processed.length}
          suggestions={suggestions}
          messages={messages}
          pending={pending}
          focus={focus}
          onAsk={(question) => void askQuestion(question)}
          onFocus={setFocus}
          voice={voice}
        />
      </main>
      {dragging && (
        <div className="drop-hint" aria-hidden="true">
          Drop PDF reports to add them
        </div>
      )}
    </div>
  )
}
