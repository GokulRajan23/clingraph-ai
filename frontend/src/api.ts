/**
 * The only seam between the UI and the outside world. Graph building and the timeline are still
 * resolved locally from a fixture. Questions are answered by the backend's LLM (/api/ask), which is
 * sent the graph; voice goes through /api/voice/*. The backend holds the API keys.
 */
import { FALLBACK, problemAnswer, scriptedAnswer, SUGGESTIONS, toAnswer, type Answer, type Turn } from './chat/script'
import { FIXTURE } from './graph/fixture'
import { nameReports } from './graph/naming'
import { deriveTimeline, type Timeline } from './graph/timeline'
import type { Graph } from './graph/types'

const PROCESSING_MS = 1600
const ANSWER_MS = 700

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

/** Parses the uploaded PDFs. Resolves once they are part of the graph. */
export async function processReports(_files: File[]): Promise<void> {
  await wait(PROCESSING_MS)
}

/** The knowledge graph for the processed reports, given their file names in upload order. */
export async function fetchGraph(fileNames: string[]): Promise<Graph> {
  return nameReports(FIXTURE, fileNames)
}

/**
 * The patient's history over time for a graph returned by `fetchGraph`. Derived locally for now;
 * a backend may return it instead, as long as its node IDs match the graph's.
 */
export async function fetchTimeline(graph: Graph): Promise<Timeline> {
  return deriveTimeline(graph)
}

/** Questions to offer once the graph is ready. */
export async function fetchSuggestions(): Promise<string[]> {
  return SUGGESTIONS.map((s) => s.question)
}

/**
 * Answers a question about the graph. Suggested questions get their scripted answer at once;
 * anything else goes to the LLM with the graph and the conversation so far. Without the backend
 * or a configured model, the fallback answer says what can be asked.
 */
export async function ask(question: string, graph: Graph, history: Turn[]): Promise<Answer> {
  const scripted = scriptedAnswer(question)
  if (scripted) {
    await wait(ANSWER_MS)
    return scripted
  }
  let response: Response
  try {
    response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, graph, history }),
    })
  } catch {
    return FALLBACK
  }
  // 404: an older backend without /api/ask. 503: no model configured.
  if (response.status === 404 || response.status === 503) return FALLBACK
  if (!response.ok) return problemAnswer(`Sorry, I couldn't answer that just now. ${await failure(response, 'The answer service failed')}`)
  try {
    return toAnswer(await response.json()) ?? FALLBACK
  } catch {
    return FALLBACK
  }
}

/** Whether the backend is running with an ElevenLabs key. Any failure means no voice. */
export async function voiceStatus(): Promise<boolean> {
  try {
    const response = await fetch('/api/voice/status')
    if (!response.ok) return false
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null && (body as { enabled?: unknown }).enabled === true
  } catch {
    return false
  }
}

/** Speech-to-text for one recorded question. */
export async function transcribe(audio: Blob): Promise<string> {
  const form = new FormData()
  const extension = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm'
  form.append('audio', audio, `question.${extension}`)
  const response = await fetch('/api/voice/transcribe', { method: 'POST', body: form })
  if (!response.ok) throw new Error(await failure(response, 'Transcription failed'))
  const body = (await response.json()) as { text?: unknown }
  return typeof body.text === 'string' ? body.text.trim() : ''
}

/** Text-to-speech: MP3 audio for an answer. */
export async function speak(text: string): Promise<Blob> {
  const response = await fetch('/api/voice/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!response.ok) throw new Error(await failure(response, 'Could not read the answer aloud'))
  return response.blob()
}

async function failure(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
  } catch {
    // Not JSON: fall through.
  }
  return `${fallback} (${response.status})`
}
