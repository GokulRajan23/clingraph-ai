/**
 * Answers about the patient's history, phrased the way a colleague would say them: a few sentences,
 * shown as a short paragraph and read aloud, plus the reports they come from and the graph nodes
 * they are about (highlighted when the answer appears). The suggested questions have scripted
 * answers; anything else is answered by the backend's LLM (see api.ask).
 */

export interface Answer {
  /** What is shown and said, one sentence each. */
  sentences: string[]
  /** Report node IDs the answer comes from. */
  sources: string[]
  /** Node IDs to highlight in the graph. Empty for the fallback answer. */
  highlight: string[]
  /** The answer stopped partway (the model failed or stalled); its sentences so far are kept. */
  cutShort?: boolean
}

export interface Suggestion {
  question: string
  answer: Answer
}

export const SUGGESTIONS: Suggestion[] = [
  {
    question: 'How has the left kidney obstruction changed?',
    answer: {
      sentences: [
        'It got worse before the stent and has now resolved.',
        'The left side was mildly dilated on 12 January and moderately dilated by 19 January, when a stent was placed.',
        'It was down to mild by 21 January and had resolved on the 2 March ultrasound.',
      ],
      sources: ['r1', 'r2', 'r3', 'r5'],
      highlight: ['hydro', 'hydro-1', 'hydro-2', 'hydro-3', 'hydro-4', 'stent', 'r1', 'r2', 'r3', 'r5'],
    },
  },
  {
    question: 'Which procedures are documented?',
    answer: {
      sentences: [
        'Two procedures, both on the left side.',
        'A double-J stent was placed on 19 January 2026 to relieve the obstruction.',
        'On 2 February a ureteroscopy with laser lithotripsy removed the 6 mm stone, and the stent came out.',
      ],
      sources: ['r2', 'r4'],
      highlight: ['stent', 'ureteroscopy', 'left-stone', 'r2', 'r4'],
    },
  },
  {
    question: 'What changed in the latest report?',
    answer: {
      sentences: [
        "At the 2 March review he's recovered, and the obstruction and kidney injury have resolved.",
        'Creatinine is back to 1.0 mg/dL, and the stone turned out to be calcium oxalate.',
        'The 3 mm right kidney stone is unchanged and stays under surveillance.',
      ],
      sources: ['r5'],
      highlight: ['r5', 'hydro-4', 'creatinine-4', 'analysis', 'right-stone-2', 'left-stone-4'],
    },
  },
  {
    question: 'What is the current medication?',
    answer: {
      sentences: [
        'Amlodipine 5 mg each morning is now his only regular medication.',
        "Tamsulosin was stopped on 2 February, and he hasn't needed paracetamol since 5 February.",
      ],
      sources: ['r5'],
      highlight: ['amlodipine', 'tamsulosin', 'paracetamol', 'r5'],
    },
  },
]

export const FALLBACK: Answer = {
  sentences: [
    "I couldn't find a confident answer to that in the uploaded reports. Try asking how a finding changed, which procedures are documented, or what the current treatment is.",
  ],
  sources: [],
  highlight: [],
}

const normalize = (text: string) => text.trim().toLowerCase().replace(/[?.!\s]+$/, '').replace(/\s+/g, ' ')

/** The scripted answer for a suggested question (typed or clicked), if it is one. */
export function scriptedAnswer(question: string): Answer | null {
  const key = normalize(question)
  return SUGGESTIONS.find((s) => normalize(s.question) === key)?.answer ?? null
}

/** The scripted answer for a suggested question, otherwise the fallback. */
export function answerFor(question: string): Answer {
  return scriptedAnswer(question) ?? FALLBACK
}

/** A one-sentence answer that says what went wrong, with no sources or highlights. */
export function problemAnswer(text: string): Answer {
  return { sentences: [text], sources: [], highlight: [] }
}

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string')

/**
 * Reads the backend's streamed answer (NDJSON): a "sentence" event per sentence, then "done" with
 * the sources and highlights, or "error". `onSentence` gets the sentences so far each time one
 * arrives. If the stream fails after some sentences they are kept and the answer is marked cut
 * short; before any, the answer says what went wrong.
 */
export async function readAnswer(body: ReadableStream<Uint8Array>, onSentence: (sentences: string[]) => void): Promise<Answer> {
  const sentences: string[] = []
  const end = (problem: string): Answer =>
    sentences.length > 0 ? { sentences, sources: [], highlight: [], cutShort: true } : problemAnswer(`Sorry, I couldn't answer that just now. ${problem}`)
  // One event; an Answer once the stream is over.
  const handle = (raw: string): Answer | null => {
    if (!raw.trim()) return null
    let event: { type?: unknown; text?: unknown; sources?: unknown; highlight?: unknown; detail?: unknown }
    try {
      event = JSON.parse(raw)
    } catch {
      return null
    }
    if (event.type === 'sentence' && typeof event.text === 'string' && event.text.trim()) {
      sentences.push(event.text.trim())
      onSentence([...sentences])
    } else if (event.type === 'done' && sentences.length > 0) {
      return { sentences, sources: isStrings(event.sources) ? event.sources : [], highlight: isStrings(event.highlight) ? event.highlight : [] }
    } else if (event.type === 'error' || event.type === 'done') {
      return end(typeof event.detail === 'string' ? event.detail : 'The answer service failed')
    }
    return null
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      const events = (buffer + decoder.decode(value, { stream: true })).split('\n')
      buffer = events.pop() ?? ''
      for (const event of events) {
        const answer = handle(event)
        if (answer) return answer
      }
    }
  } catch {
    return end('The connection was lost')
  } finally {
    void reader.cancel().catch(() => undefined)
  }
  return handle(buffer) ?? end('The answer stopped partway')
}

/** An earlier turn of the conversation, as context for a follow-up question. */
export interface Turn {
  role: 'user' | 'assistant'
  text: string
}

/**
 * The last `limit` turns of a conversation. Answers go back in the form the model wrote them (a
 * sentence per line, then the HIGHLIGHT line): given plain text, it copies that and drops the line.
 */
export function historyOf(messages: ({ role: 'user'; text: string } | { role: 'assistant'; answer: Answer })[], limit = 8): Turn[] {
  return messages.slice(-limit).map((m) => (m.role === 'user' ? { role: 'user', text: m.text } : { role: 'assistant', text: modelText(m.answer) }))
}

const modelText = (answer: Answer) => [...answer.sentences, `HIGHLIGHT: ${answer.highlight.join(', ')}`].join('\n')

// Clinical shorthand a voice would read letter by letter.
const SPOKEN: [RegExp, string][] = [
  // Before a noun a size is an adjective: "a 6 mm stone" is "a 6 millimetre stone".
  [/(\d) ?mm (?!(?:in|on|at|to|and|or|by|from|with|when|since|before|after|then|but|is|was|has|had)\b)(?=[a-z])/g, '$1 millimetre '],
  [/(\d) ?mm\b/g, '$1 millimetres'],
  [/(\d) ?ml\b/g, '$1 millilitres'],
  [/(\d) ?mg\/dL\b/g, '$1 milligrams per decilitre'],
  [/(\d) ?mg\b/g, '$1 milligrams'],
  [/(\d) ?Fr\b/g, '$1 French'],
  [/\bMR\b/g, 'modified release'],
  [/(\d) ?%/g, '$1 percent'],
  [/\bq3w\b/g, 'every three weeks'],
  [/ \/ /g, ' and '],
  // "02 Mar 2022" is read as "zero two Mar"; say "2 March 2022".
  [/\b0(\d) (?=[A-Z][a-z]{2} \d{4})/g, '$1 '],
]

const MONTHS: Record<string, string> = {
  Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', Jun: 'June', Jul: 'July',
  Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
}

/** The whole answer as one passage to read aloud. */
export function speechText(answer: Answer): string {
  return answer.sentences.map(speakable).join(' ')
}

/** A sentence as it should be read aloud: units and dates spelled out. */
export function speakable(sentence: string): string {
  let text = sentence.trim()
  for (const [pattern, spoken] of SPOKEN) text = text.replace(pattern, spoken)
  return text.replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?= \d{4})/g, (m) => MONTHS[m])
}
