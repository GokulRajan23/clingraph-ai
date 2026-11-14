/**
 * The only seam between the UI and the outside world. Graph building and querying are still
 * resolved locally from a fixture and hardcoded answers; voice goes through the backend
 * (/api/voice/*), which holds the ElevenLabs key.
 */
import { answerFor, SUGGESTIONS, type Answer } from './chat/script'
import { FIXTURE } from './graph/fixture'
import { nameReports } from './graph/naming'
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

/** Questions to offer once the graph is ready. */
export async function fetchSuggestions(): Promise<string[]> {
  return SUGGESTIONS.map((s) => s.question)
}

/** Answers a question about the graph. */
export async function ask(question: string): Promise<Answer> {
  await wait(ANSWER_MS)
  return answerFor(question)
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
