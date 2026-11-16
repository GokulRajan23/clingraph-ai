/**
 * The only seam between the UI and the backend. For the demo the patient records are hardcoded in
 * demo/data.ts (taken as already uploaded); questions are answered by the backend's LLM
 * (/api/ask), which is sent the graph, and voice goes through /api/voice/*. The backend holds
 * the API keys.
 */
import { FALLBACK, problemAnswer, readAnswer, scriptedAnswer, type Answer, type Turn } from './chat/script'
import { topicAnswer } from './chat/topics'
import type { Graph } from './graph/types'

const ANSWER_MS = 700

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

/**
 * Answers a question about the graph. Suggested questions get their scripted answer at once;
 * anything else goes to the LLM with the graph and the conversation so far, and `onSentence` is
 * called with the sentences so far as each one arrives. Without the backend or a configured model,
 * or when the model fails before saying anything (e.g. its free quota is used up), the answer for
 * the question's topic is given (chat/topics.ts), else the fallback answer says what can be asked.
 */
export async function ask(question: string, graph: Graph, history: Turn[], onSentence: (sentences: string[]) => void, signal?: AbortSignal): Promise<Answer> {
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
      signal,
    })
  } catch {
    if (signal?.aborted) return FALLBACK
    return offline(question)
  }
  // 404: an older backend without /api/ask. 503: no model configured.
  if (response.status === 404 || response.status === 503) return offline(question)
  if (!response.ok || !response.body) {
    const problem = problemAnswer(`Sorry, I couldn't answer that just now. ${await failure(response, 'The answer service failed')}`)
    return (await offline(question, null)) ?? problem
  }
  const answer = await readAnswer(response.body, onSentence)
  return answer.failed ? ((await offline(question, null)) ?? answer) : answer
}

/** The answer for the question's topic, after the same short pause as a scripted one; else `otherwise`. */
async function offline<T extends Answer | null = Answer>(question: string, otherwise: T = FALLBACK as T): Promise<Answer | T> {
  const answer = topicAnswer(question)
  if (!answer) return otherwise
  await wait(ANSWER_MS)
  return answer
}

/**
 * Whether the backend is running with an ElevenLabs key, or null when the backend did not answer
 * (not started yet, or down), so the caller can ask again.
 */
export async function voiceStatus(): Promise<boolean | null> {
  try {
    const response = await fetch('/api/voice/status')
    if (!response.ok) return null
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null && (body as { enabled?: unknown }).enabled === true
  } catch {
    return null
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

/** Text-to-speech: MP3 audio for one sentence of an answer. `previousText` is what was said just before. */
export async function speak(text: string, previousText?: string): Promise<Blob> {
  const response = await fetch('/api/voice/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, previous_text: previousText || null }),
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
